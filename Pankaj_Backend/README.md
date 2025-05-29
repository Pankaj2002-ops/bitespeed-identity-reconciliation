# Bitespeed Backend Task: Identity Reconciliation

This project is a Node.js web service that reconciles customer identities based on email and phone number. It uses Express.js for the server, Prisma ORM for database operations, and SQLite as the database.

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database:
   - The project uses SQLite. The database file is created automatically at `./dev.db`.
   - Run the Prisma migration to create the database schema:
     ```bash
     npx prisma migrate dev
     ```

4. Start the server:
   ```bash
   node index.js
   ```
   The server will run on port 3000 by default. You can change the port by setting the `PORT` environment variable.

## API Usage

### Endpoint: POST /identify

This endpoint reconciles customer identities based on email and phone number.

#### Request Body

```json
{
  "email": "example@example.com",
  "phoneNumber": "1234567890"
}
```

- At least one of `email` or `phoneNumber` must be provided.

#### Response

- **200 OK**: Returns a JSON object with the consolidated contact information.
  ```json
  {
    "contact": {
      "primaryContatctId": 1,
      "emails": ["example@example.com"],
      "phoneNumbers": ["1234567890"],
      "secondaryContactIds": []
    }
  }
  ```

- **400 Bad Request**: If neither `email` nor `phoneNumber` is provided.
- **500 Internal Server Error**: If an error occurs during processing.

## Testing

Run the tests using:
```bash
npm test
```

## License

ISC 