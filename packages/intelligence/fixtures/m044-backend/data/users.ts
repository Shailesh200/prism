import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function listUsers() {
  return prisma.user.findMany();
}
