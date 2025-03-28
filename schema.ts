import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Base user schema for authentication if needed
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// IPC Process schema
export const processes = pgTable("processes", {
  id: serial("id").primaryKey(),
  pid: integer("pid").notNull(),
  name: text("name").notNull(),
  type: text("type"),
  startTime: timestamp("start_time").defaultNow(),
  messageCount: integer("message_count").default(0),
});

export const insertProcessSchema = createInsertSchema(processes).omit({
  id: true,
  messageCount: true,
  startTime: true,
});

// Extend the base schema to add optional messageCount for sample data
const extendedInsertProcessSchema = insertProcessSchema.extend({
  messageCount: z.number().optional(),
});

export type InsertProcess = z.infer<typeof extendedInsertProcessSchema>;
export type Process = typeof processes.$inferSelect;

// IPC Event schema
export const ipcEvents = pgTable("ipc_events", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow(),
  sourcePid: integer("source_pid").notNull(),
  sourceName: text("source_name"),
  targetPid: integer("target_pid").notNull(),
  targetName: text("target_name"),
  messageType: text("message_type").notNull(),
  size: integer("size"),
  status: text("status").notNull(),
  data: jsonb("data"),
});

export const insertIpcEventSchema = createInsertSchema(ipcEvents).omit({
  id: true,
  timestamp: true,
});

// Extend the base schema to add optional timestamp for sample data
const extendedInsertIpcEventSchema = insertIpcEventSchema.extend({
  timestamp: z.date().optional(),
  payload: z.string().optional(), // For serialized JSON payload
  responseTime: z.number().optional(), // For response time metrics
});

export type InsertIpcEvent = z.infer<typeof extendedInsertIpcEventSchema>;
export type IpcEvent = typeof ipcEvents.$inferSelect;

// Define message types to use as enum
export const MessageTypes = {
  SHARED_MEMORY: "SHARED_MEMORY",
  PIPE: "PIPE",
  SOCKET: "SOCKET",
  MESSAGE_QUEUE: "MESSAGE_QUEUE",
  SIGNAL: "SIGNAL",
  REQUEST: "REQUEST",
  RESPONSE: "RESPONSE",
  NOTIFICATION: "NOTIFICATION",
} as const;

// Define status types to use as enum
export const StatusTypes = {
  SUCCESS: "SUCCESS",
  ERROR: "ERROR",
  PENDING: "PENDING",
} as const;

// Websocket message schema
export const wsMessageSchema = z.object({
  type: z.string(),
  data: z.any(),
});

export type WSMessage = z.infer<typeof wsMessageSchema>;
