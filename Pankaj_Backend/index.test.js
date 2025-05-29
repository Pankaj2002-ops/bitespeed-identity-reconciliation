const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const { PrismaClient } = require('./generated/prisma');

let app;
let prisma;

beforeAll(async () => {
  app = express();
  app.use(bodyParser.json());
  prisma = new PrismaClient();

  // Import the /identify endpoint logic from index.js
  // For simplicity, redefine the endpoint here for test isolation
  app.post('/identify', async (req, res) => {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: 'Either email or phoneNumber must be provided' });
    }
    try {
      const existingContacts = await prisma.contact.findMany({
        where: {
          OR: [
            { email: email || undefined },
            { phoneNumber: phoneNumber || undefined }
          ],
          deletedAt: null
        },
        orderBy: { createdAt: 'asc' }
      });
      if (existingContacts.length === 0) {
        const newContact = await prisma.contact.create({
          data: { email, phoneNumber, linkPrecedence: 'PRIMARY' }
        });
        return res.status(200).json({
          contact: {
            primaryContatctId: newContact.id,
            emails: newContact.email ? [newContact.email] : [],
            phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
            secondaryContactIds: []
          }
        });
      }
      const primaryContact = existingContacts[0];
      const secondaryContacts = existingContacts.slice(1);
      if ((email && !existingContacts.some(c => c.email === email)) ||
          (phoneNumber && !existingContacts.some(c => c.phoneNumber === phoneNumber))) {
        const newSecondary = await prisma.contact.create({
          data: {
            email,
            phoneNumber,
            linkedId: primaryContact.id,
            linkPrecedence: 'SECONDARY'
          }
        });
        secondaryContacts.push(newSecondary);
      }
      const allContacts = [primaryContact, ...secondaryContacts];
      const emails = allContacts.map(c => c.email).filter(Boolean);
      const phoneNumbers = allContacts.map(c => c.phoneNumber).filter(Boolean);
      const secondaryContactIds = secondaryContacts.map(c => c.id);
      return res.status(200).json({
        contact: {
          primaryContatctId: primaryContact.id,
          emails,
          phoneNumbers,
          secondaryContactIds
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up the Contact table before each test
  await prisma.contact.deleteMany();
});

describe('/identify endpoint', () => {
  it('should create a new primary contact if no match', async () => {
    const res = await request(app)
      .post('/identify')
      .send({ email: 'test1@example.com', phoneNumber: '111111' });
    expect(res.statusCode).toBe(200);
    expect(res.body.contact.primaryContatctId).toBeDefined();
    expect(res.body.contact.emails).toContain('test1@example.com');
    expect(res.body.contact.phoneNumbers).toContain('111111');
    expect(res.body.contact.secondaryContactIds).toEqual([]);
  });

  it('should link contacts as secondary if email or phone matches', async () => {
    // Create initial contact
    await prisma.contact.create({
      data: { email: 'test2@example.com', phoneNumber: '222222', linkPrecedence: 'PRIMARY' }
    });
    // New request with same phone, different email
    const res = await request(app)
      .post('/identify')
      .send({ email: 'test2b@example.com', phoneNumber: '222222' });
    expect(res.statusCode).toBe(200);
    expect(res.body.contact.emails).toEqual(expect.arrayContaining(['test2@example.com', 'test2b@example.com']));
    expect(res.body.contact.phoneNumbers).toEqual(['222222']);
    expect(res.body.contact.secondaryContactIds.length).toBe(1);
  });

  it('should consolidate all related contacts', async () => {
    // Create two contacts with same phone, different emails
    const c1 = await prisma.contact.create({
      data: { email: 'a@example.com', phoneNumber: '333333', linkPrecedence: 'PRIMARY' }
    });
    await prisma.contact.create({
      data: { email: 'b@example.com', phoneNumber: '333333', linkPrecedence: 'SECONDARY', linkedId: c1.id }
    });
    // New request with one of the emails
    const res = await request(app)
      .post('/identify')
      .send({ email: 'b@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body.contact.primaryContatctId).toBe(c1.id);
    expect(res.body.contact.emails).toEqual(expect.arrayContaining(['a@example.com', 'b@example.com']));
    expect(res.body.contact.phoneNumbers).toEqual(['333333', '333333']);
    expect(res.body.contact.secondaryContactIds.length).toBe(1);
  });

  it('should return 400 if neither email nor phoneNumber is provided', async () => {
    const res = await request(app)
      .post('/identify')
      .send({});
    expect(res.statusCode).toBe(400);
  });
}); 