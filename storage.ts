import { 
  processes, Process, InsertProcess,
  ipcEvents, IpcEvent, InsertIpcEvent,
  users, User, InsertUser 
} from "@shared/schema";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Process operations
  getProcesses(): Promise<Process[]>;
  getProcessById(id: number): Promise<Process | undefined>;
  getProcessByPid(pid: number): Promise<Process | undefined>;
  createProcess(process: InsertProcess): Promise<Process>;
  updateProcessMessageCount(pid: number, increment: number): Promise<Process | undefined>;
  getTopProcesses(limit: number): Promise<Process[]>;
  
  // IPC event operations
  getEvents(limit?: number, offset?: number): Promise<IpcEvent[]>;
  getEventById(id: number): Promise<IpcEvent | undefined>;
  createEvent(event: InsertIpcEvent): Promise<IpcEvent>;
  getEventsByProcessPid(pid: number): Promise<IpcEvent[]>;
  getEventsFiltered(filter: {
    pid?: number,
    type?: string,
    status?: string,
    timeRange?: { start: Date, end: Date }
  }): Promise<IpcEvent[]>;
  clearEvents(): Promise<void>;
  
  // Stats operations
  getTotalMessageCount(): Promise<number>;
  getActiveProcessCount(): Promise<number>;
  getAverageResponseTime(): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private processes: Map<number, Process>;
  private events: Map<number, IpcEvent>;
  private userCurrentId: number;
  private processCurrentId: number;
  private eventCurrentId: number;

  constructor() {
    this.users = new Map();
    this.processes = new Map();
    this.events = new Map();
    this.userCurrentId = 1;
    this.processCurrentId = 1;
    this.eventCurrentId = 1;
    
    // Initialize with some sample processes
    this.initializeProcesses();
  }

  private initializeProcesses() {
    const sampleProcesses: InsertProcess[] = [
      { pid: 1234, name: "chrome", type: "browser", messageCount: 8 },
      { pid: 2345, name: "firefox", type: "browser", messageCount: 5 },
      { pid: 3456, name: "vscode", type: "editor", messageCount: 12 },
      { pid: 4567, name: "slack", type: "communication", messageCount: 7 },
      { pid: 5678, name: "terminal", type: "system", messageCount: 3 }
    ];
    
    // Create sample processes
    const processPromises = sampleProcesses.map(proc => this.createProcess(proc));
    
    // Create sample IPC events
    Promise.all(processPromises).then(() => {
      const now = new Date();
      const sampleEvents: InsertIpcEvent[] = [
        {
          sourcePid: 1234,
          targetPid: 3456,
          messageType: "REQUEST",
          status: "SUCCESS",
          data: { action: "open_file", path: "/home/user/document.txt" },
          size: 128,
          sourceName: "chrome",
          targetName: "vscode"
        },
        {
          sourcePid: 3456,
          targetPid: 1234,
          messageType: "RESPONSE",
          status: "SUCCESS",
          data: { success: true, message: "File opened successfully" },
          size: 64,
          sourceName: "vscode",
          targetName: "chrome"
        },
        {
          sourcePid: 2345,
          targetPid: 5678,
          messageType: "REQUEST",
          status: "ERROR",
          data: { action: "execute_command", command: "npm install" },
          size: 92,
          sourceName: "firefox",
          targetName: "terminal"
        },
        {
          sourcePid: 4567,
          targetPid: 1234,
          messageType: "NOTIFICATION",
          status: "SUCCESS",
          data: { type: "new_message", from: "user@example.com" },
          size: 76,
          sourceName: "slack",
          targetName: "chrome"
        },
        {
          sourcePid: 3456,
          targetPid: 5678,
          messageType: "REQUEST",
          status: "SUCCESS",
          data: { action: "git_push", repository: "main" },
          size: 102,
          sourceName: "vscode",
          targetName: "terminal"
        },
        {
          sourcePid: 1234,
          targetPid: 4567,
          messageType: "NOTIFICATION",
          status: "SUCCESS",
          data: { action: "share_url", url: "https://example.com" },
          size: 88,
          sourceName: "chrome",
          targetName: "slack"
        },
        {
          sourcePid: 2345,
          targetPid: 3456,
          messageType: "REQUEST",
          status: "SUCCESS",
          data: { action: "debug_script", file: "main.js" },
          size: 112,
          sourceName: "firefox",
          targetName: "vscode"
        },
        {
          sourcePid: 5678,
          targetPid: 3456,
          messageType: "RESPONSE",
          status: "SUCCESS",
          data: { result: "Process completed successfully" },
          size: 86,
          sourceName: "terminal",
          targetName: "vscode"
        }
      ];
      
      // Add timestamps with intervals (most recent first)
      for (let i = 0; i < sampleEvents.length; i++) {
        const timestamp = new Date(now);
        timestamp.setMinutes(now.getMinutes() - i * 3); // 3 minutes apart
        this.createEvent({ ...sampleEvents[i], timestamp });
      }
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Process operations
  async getProcesses(): Promise<Process[]> {
    return Array.from(this.processes.values());
  }

  async getProcessById(id: number): Promise<Process | undefined> {
    return this.processes.get(id);
  }

  async getProcessByPid(pid: number): Promise<Process | undefined> {
    return Array.from(this.processes.values()).find(
      (process) => process.pid === pid
    );
  }

  async createProcess(insertProcess: InsertProcess): Promise<Process> {
    const id = this.processCurrentId++;
    const startTime = new Date();
    
    // Ensure we have properly typed null values instead of undefined
    const type = insertProcess.type !== undefined ? insertProcess.type : null;
    
    const process: Process = { 
      id, 
      name: insertProcess.name,
      pid: insertProcess.pid,
      type,
      startTime,
      messageCount: insertProcess.messageCount !== undefined ? insertProcess.messageCount : 0
    };
    
    this.processes.set(id, process);
    return process;
  }

  async updateProcessMessageCount(pid: number, increment: number): Promise<Process | undefined> {
    const process = await this.getProcessByPid(pid);
    if (!process) return undefined;
    
    // Safely update messageCount handling null
    const currentCount = process.messageCount || 0;
    process.messageCount = currentCount + increment;
    
    this.processes.set(process.id, process);
    return process;
  }

  async getTopProcesses(limit: number): Promise<Process[]> {
    return Array.from(this.processes.values())
      .sort((a, b) => {
        // Handle null values safely
        const countA = a.messageCount || 0;
        const countB = b.messageCount || 0;
        return countB - countA;
      })
      .slice(0, limit);
  }

  // IPC event operations
  async getEvents(limit = 100, offset = 0): Promise<IpcEvent[]> {
    const allEvents = Array.from(this.events.values())
      .sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.getTime() : 0;
        const timeB = b.timestamp ? b.timestamp.getTime() : 0;
        return timeB - timeA;
      });
    
    return allEvents.slice(offset, offset + limit);
  }

  async getEventById(id: number): Promise<IpcEvent | undefined> {
    return this.events.get(id);
  }

  async createEvent(insertEvent: InsertIpcEvent): Promise<IpcEvent> {
    const id = this.eventCurrentId++;
    // Use the provided timestamp or create a new one
    const timestamp = insertEvent.timestamp || new Date();
    
    // Properly convert optional fields to their typed equivalents
    const sourceName = insertEvent.sourceName !== undefined ? insertEvent.sourceName : null;
    const targetName = insertEvent.targetName !== undefined ? insertEvent.targetName : null;
    const size = insertEvent.size !== undefined ? insertEvent.size : null;
    
    // Ensure we provide a default data if not present
    const data = insertEvent.data || null;
    
    const event: IpcEvent = {
      id,
      timestamp,
      sourcePid: insertEvent.sourcePid,
      sourceName,
      targetPid: insertEvent.targetPid,
      targetName,
      messageType: insertEvent.messageType,
      size,
      status: insertEvent.status,
      data
    };
    
    this.events.set(id, event);
    
    // Update message counts for source and target processes
    await this.updateProcessMessageCount(insertEvent.sourcePid, 1);
    
    return event;
  }

  async getEventsByProcessPid(pid: number): Promise<IpcEvent[]> {
    return Array.from(this.events.values())
      .filter(event => event.sourcePid === pid || event.targetPid === pid)
      .sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.getTime() : 0;
        const timeB = b.timestamp ? b.timestamp.getTime() : 0;
        return timeB - timeA;
      });
  }

  async getEventsFiltered(filter: {
    pid?: number,
    type?: string,
    status?: string,
    timeRange?: { start: Date, end: Date }
  }): Promise<IpcEvent[]> {
    let filteredEvents = Array.from(this.events.values());
    
    if (filter.pid) {
      filteredEvents = filteredEvents.filter(
        event => event.sourcePid === filter.pid || event.targetPid === filter.pid
      );
    }
    
    if (filter.type) {
      filteredEvents = filteredEvents.filter(
        event => event.messageType === filter.type
      );
    }
    
    if (filter.status) {
      filteredEvents = filteredEvents.filter(
        event => event.status === filter.status
      );
    }
    
    if (filter.timeRange) {
      filteredEvents = filteredEvents.filter(
        event => {
          if (!event.timestamp) return false;
          return event.timestamp >= filter.timeRange!.start && 
                 event.timestamp <= filter.timeRange!.end;
        }
      );
    }
    
    return filteredEvents.sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.getTime() : 0;
      const timeB = b.timestamp ? b.timestamp.getTime() : 0;
      return timeB - timeA;
    });
  }

  async clearEvents(): Promise<void> {
    this.events.clear();
    
    // Reset message counts for all processes
    // Convert to array first to avoid iteration issues
    const processes = Array.from(this.processes.values());
    for (const process of processes) {
      process.messageCount = 0;
      this.processes.set(process.id, process);
    }
  }

  // Stats operations
  async getTotalMessageCount(): Promise<number> {
    return this.events.size;
  }

  async getActiveProcessCount(): Promise<number> {
    // Count processes that have sent or received messages in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEvents = Array.from(this.events.values())
      .filter(event => {
        if (!event.timestamp) return false;
        return event.timestamp >= oneHourAgo;
      });
    
    const activePids = new Set<number>();
    recentEvents.forEach(event => {
      activePids.add(event.sourcePid);
      activePids.add(event.targetPid);
    });
    
    return activePids.size;
  }

  async getAverageResponseTime(): Promise<number> {
    // This is a placeholder for actual response time calculation
    // In a real implementation, we would track request-response pairs
    // For now, we'll return a random value between 100-300ms
    return Math.floor(Math.random() * 200) + 100;
  }
}

export const storage = new MemStorage();
