const express = require('express');
const bodyParser = require('body-parser');
const { PrismaClient } = require('./generated/prisma');

const app = express();
const prisma = new PrismaClient();

app.use(bodyParser.json());

// Placeholder for /identify endpoint
app.post('/identify', async (req, res) => {
  const { email, phoneNumber } = req.body;
  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'Either email or phoneNumber must be provided' });
  }

  try {
    // Find all contacts that match by email or phoneNumber
    let relatedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          email ? { email } : undefined,
          phoneNumber ? { phoneNumber } : undefined
        ].filter(Boolean),
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    // If no related contacts, create a new primary
    if (relatedContacts.length === 0) {
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

    // If new info is present, create a secondary contact linked to the primary
    const alreadyHasEmail = email && relatedContacts.some(c => c.email === email);
    const alreadyHasPhone = phoneNumber && relatedContacts.some(c => c.phoneNumber === phoneNumber);
    if ((email && !alreadyHasEmail) || (phoneNumber && !alreadyHasPhone)) {
      await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkedId: relatedContacts[0].id,
          linkPrecedence: 'SECONDARY'
        }
      });
      // After creating, re-gather the cluster recursively
      // Start from scratch: find all contacts with this email or phone
      relatedContacts = await prisma.contact.findMany({
        where: {
          OR: [
            email ? { email } : undefined,
            phoneNumber ? { phoneNumber } : undefined
          ].filter(Boolean),
          deletedAt: null
        },
        orderBy: { createdAt: 'asc' }
      });
      let clusterIds = new Set(relatedContacts.map(c => c.id));
      let queue = [...relatedContacts];
      while (queue.length > 0) {
        const current = queue.pop();
        const more = await prisma.contact.findMany({
          where: {
            OR: [
              { linkedId: current.id },
              { id: current.linkedId || undefined }
            ].filter(Boolean),
            deletedAt: null
          }
        });
        for (const m of more) {
          if (!clusterIds.has(m.id)) {
            clusterIds.add(m.id);
            queue.push(m);
          }
        }
      }
      relatedContacts = await prisma.contact.findMany({
        where: { id: { in: Array.from(clusterIds) }, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      });
    }

    // Find the oldest contact as primary (by createdAt, then id)
    const primaryContactFinal = relatedContacts.reduce((oldest, c) => {
      if (!oldest) return c;
      if (c.createdAt < oldest.createdAt) return c;
      if (c.createdAt.getTime() === oldest.createdAt.getTime() && c.id < oldest.id) return c;
      return oldest;
    }, null);
    // All others are secondary
    const secondaryContactsFinal = relatedContacts.filter(c => c.id !== primaryContactFinal.id);

    // Deduplicate emails and phoneNumbers strictly
    const emailsSet = new Set();
    const emails = [];
    for (const c of relatedContacts) {
      if (c.email && !emailsSet.has(c.email)) {
        emailsSet.add(c.email);
        emails.push(c.email);
      }
    }
    const phoneNumbersSet = new Set();
    const phoneNumbers = [];
    for (const c of relatedContacts) {
      if (c.phoneNumber && !phoneNumbersSet.has(c.phoneNumber)) {
        phoneNumbersSet.add(c.phoneNumber);
        phoneNumbers.push(c.phoneNumber);
      }
    }
    const secondaryContactIds = secondaryContactsFinal.map(c => c.id);

    return res.status(200).json({
      contact: {
        primaryContatctId: primaryContactFinal.id,
        emails,
        phoneNumbers,
        secondaryContactIds
      }
    });
  } catch (error) {
    console.error('Error in /identify:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 

