import { type User, type InsertUser, type Feedback, type InsertFeedback } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  getFeedbacks(): Promise<Feedback[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private feedbacks: Map<string, Feedback>;

  constructor() {
    this.users = new Map();
    this.feedbacks = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
    const id = randomUUID();
    const feedback: Feedback = {
      id,
      companyName: insertFeedback.companyName,
      description: insertFeedback.description || null,
      impactLevel: insertFeedback.impactLevel || null,
      feedbackType: insertFeedback.feedbackType,
      fileName: insertFeedback.fileName || null,
      fileUrl: insertFeedback.fileUrl || null,
      createdAt: new Date(),
    };
    this.feedbacks.set(id, feedback);
    return feedback;
  }

  async getFeedbacks(): Promise<Feedback[]> {
    return Array.from(this.feedbacks.values());
  }
}

export const storage = new MemStorage();
