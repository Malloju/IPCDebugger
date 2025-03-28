import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { storage } from "./storage";
import { 
  insertIpcEventSchema, 
  insertProcessSchema, 
  MessageTypes, 
  StatusTypes,
  wsMessageSchema
} from "@shared/schema";
import { log } from "./vite";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server for Express and WebSocket
  const httpServer = createServer(app);
  
  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Connected clients
  const clients = new Set<WebSocket>();
  
  // WebSocket connection handler
  wss.on('connection', (ws) => {
    log('WebSocket client connected', 'websocket');
    clients.add(ws);
    
    // Send initial data to newly connected client
    sendInitialData(ws);
    
    ws.on('message', async (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        const validatedMessage = wsMessageSchema.parse(parsed);
        
        log(`Received WebSocket message: ${validatedMessage.type}`, 'websocket');
        
        // Handle different message types
        if (validatedMessage.type === 'create_event') {
          await handleCreateEvent(validatedMessage.data);
        }
      } catch (error) {
        log(`WebSocket message error: ${error}`, 'websocket');
      }
    });
    
    ws.on('close', () => {
      log('WebSocket client disconnected', 'websocket');
      clients.delete(ws);
    });
  });
  
  // Function to send initial data to a client
  async function sendInitialData(ws: WebSocket) {
    try {
      const processes = await storage.getProcesses();
      const events = await storage.getEvents(100, 0);
      const totalMessages = await storage.getTotalMessageCount();
      const activeProcesses = await storage.getActiveProcessCount();
      const avgResponseTime = await storage.getAverageResponseTime();
      
      const initialData = {
        processes,
        events,
        stats: {
          totalMessages,
          activeProcesses,
          avgResponseTime
        }
      };
      
      sendToClient(ws, 'initial_data', initialData);
    } catch (error) {
      log(`Error sending initial data: ${error}`, 'websocket');
    }
  }
  
  // Function to broadcast to all connected clients
  function broadcast(type: string, data: any) {
    const message = JSON.stringify({ type, data });
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
  
  // Function to send to a specific client
  function sendToClient(client: WebSocket, type: string, data: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, data }));
    }
  }
  
  // Handle creating a new IPC event
  async function handleCreateEvent(data: any) {
    try {
      const validatedData = insertIpcEventSchema.parse(data);
      const newEvent = await storage.createEvent(validatedData);
      
      // Update stats
      const totalMessages = await storage.getTotalMessageCount();
      const activeProcesses = await storage.getActiveProcessCount();
      const avgResponseTime = await storage.getAverageResponseTime();
      const topProcesses = await storage.getTopProcesses(5);
      
      // Broadcast the new event to all clients
      broadcast('new_event', newEvent);
      
      // Broadcast updated stats
      broadcast('stats_update', {
        totalMessages,
        activeProcesses,
        avgResponseTime,
        topProcesses
      });
    } catch (error) {
      log(`Error creating event: ${error}`, 'websocket');
    }
  }
  
  // API Routes
  
  // Get all processes
  app.get('/api/processes', async (req: Request, res: Response) => {
    try {
      const processes = await storage.getProcesses();
      res.json(processes);
    } catch (error) {
      res.status(500).json({ message: `Error fetching processes: ${error}` });
    }
  });
  
  // Get top processes by message count
  app.get('/api/processes/top', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const topProcesses = await storage.getTopProcesses(limit);
      res.json(topProcesses);
    } catch (error) {
      res.status(500).json({ message: `Error fetching top processes: ${error}` });
    }
  });
  
  // Create a new process
  app.post('/api/processes', async (req: Request, res: Response) => {
    try {
      const processData = insertProcessSchema.parse(req.body);
      const newProcess = await storage.createProcess(processData);
      
      // Broadcast the new process to all clients
      broadcast('new_process', newProcess);
      
      res.status(201).json(newProcess);
    } catch (error) {
      res.status(400).json({ message: `Error creating process: ${error}` });
    }
  });
  
  // Get IPC events with pagination
  app.get('/api/events', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const events = await storage.getEvents(limit, offset);
      const total = await storage.getTotalMessageCount();
      
      res.json({
        events,
        total,
        limit,
        offset
      });
    } catch (error) {
      res.status(500).json({ message: `Error fetching events: ${error}` });
    }
  });
  
  // Create a new IPC event
  app.post('/api/events', async (req: Request, res: Response) => {
    try {
      const eventData = insertIpcEventSchema.parse(req.body);
      const newEvent = await storage.createEvent(eventData);
      
      // Process broadcast through WebSocket is handled by handleCreateEvent
      await handleCreateEvent(eventData);
      
      res.status(201).json(newEvent);
    } catch (error) {
      res.status(400).json({ message: `Error creating event: ${error}` });
    }
  });
  
  // Filter events
  app.get('/api/events/filter', async (req: Request, res: Response) => {
    try {
      const { pid, type, status, startTime, endTime } = req.query;
      
      const filter: {
        pid?: number;
        type?: string;
        status?: string;
        timeRange?: { start: Date; end: Date };
      } = {};
      
      if (pid) filter.pid = parseInt(pid as string);
      if (type) filter.type = type as string;
      if (status) filter.status = status as string;
      
      if (startTime && endTime) {
        filter.timeRange = {
          start: new Date(startTime as string),
          end: new Date(endTime as string)
        };
      }
      
      const filteredEvents = await storage.getEventsFiltered(filter);
      res.json(filteredEvents);
    } catch (error) {
      res.status(500).json({ message: `Error filtering events: ${error}` });
    }
  });
  
  // Clear all events
  app.delete('/api/events', async (req: Request, res: Response) => {
    try {
      await storage.clearEvents();
      
      // Broadcast that events have been cleared
      broadcast('events_cleared', {});
      
      // Update stats
      const totalMessages = await storage.getTotalMessageCount();
      const activeProcesses = await storage.getActiveProcessCount();
      const avgResponseTime = await storage.getAverageResponseTime();
      
      // Broadcast updated stats
      broadcast('stats_update', {
        totalMessages,
        activeProcesses,
        avgResponseTime,
        topProcesses: []
      });
      
      res.json({ message: 'All events cleared successfully' });
    } catch (error) {
      res.status(500).json({ message: `Error clearing events: ${error}` });
    }
  });
  
  // Get dashboard stats
  app.get('/api/stats', async (req: Request, res: Response) => {
    try {
      const totalMessages = await storage.getTotalMessageCount();
      const activeProcesses = await storage.getActiveProcessCount();
      const avgResponseTime = await storage.getAverageResponseTime();
      const topProcesses = await storage.getTopProcesses(5);
      
      res.json({
        totalMessages,
        activeProcesses,
        avgResponseTime,
        topProcesses
      });
    } catch (error) {
      res.status(500).json({ message: `Error fetching stats: ${error}` });
    }
  });

  return httpServer;
}
