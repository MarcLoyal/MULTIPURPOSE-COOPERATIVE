import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

async function upsertUser(email: string, name: string, role: any) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  console.log("Seeding users...");
  const admin = await upsertUser("admin@coop.test", "Admin User", "admin");
  await upsertUser("cashier@coop.test", "Casey Cashier", "cashier");
  await upsertUser("credit@coop.test", "Chris Credit Officer", "credit_officer");
  await upsertUser("manager@coop.test", "Mona Manager", "manager");
  await upsertUser("accountant@coop.test", "Andy Accountant", "accountant");

  console.log("Seeding a sample member...");
  const existingMember = await prisma.member.findUnique({ where: { memberNumber: "MPC-0001" } });
  if (!existingMember) {
    await prisma.member.create({
      data: {
        memberNumber: "MPC-0001",
        fullName: "Juan Dela Cruz",
        phone: "0917-000-0000",
        email: "juan.delacruz@example.com",
        address: "Barangay Uno, Sample City",
        beneficiaryName: "Maria Dela Cruz",
        beneficiaryRelationship: "Spouse",
        createdById: admin.id,
        shareCapitalAccount: { create: { balance: 0 } },
      },
    });
  }

  console.log("Seed complete. Demo login password for all seeded users:", DEMO_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
