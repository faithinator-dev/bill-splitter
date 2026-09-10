# BitSplitter

BitSplitter is a server-backed group expense splitter. Add people, record shared expenses, and calculate the smallest practical set of payments needed to settle the group.

## Features

- Add and remove group members
- Record expenses and choose who shares each expense
- Persist application state in a local JSON file
- Calculate net balances on the server
- Generate optimized debtor-to-creditor payment suggestions
- View total spending, member count, expense count, and settlement preview
- Print or save the settlement receipt as a PDF from the browser
- Responsive public interface for desktop and mobile screens

## Requirements

- Node.js 18 or newer
- npm

## Getting Started

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open the application at:

```text
http://localhost:3000
```

To use another port on Windows PowerShell:

```powershell
$env:PORT=4000; npm start
```

## Project Structure

```text
.
├── public/
│   ├── index.html   # Application markup and design system
│   ├── main.js      # Browser client for the Express API
│   └── style.css    # Dashboard styling
├── data/
│   └── bitsplitter.json  # Runtime datastore created automatically
├── server.js        # Express server, API routes, persistence, and settlement logic
├── package.json
└── package-lock.json
```

The `data/*.json` files are ignored by Git because they contain local runtime data.

## API

All API responses use JSON.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/state` | Return all members and expenses |
| `GET` | `/api/summary` | Return spending totals and settlement preview |
| `POST` | `/api/members` | Add a member with `{ "name": "Alice" }` |
| `DELETE` | `/api/members/:name` | Remove a member and update related expenses |
| `POST` | `/api/expenses` | Add an expense |
| `DELETE` | `/api/expenses/:id` | Delete an expense |
| `DELETE` | `/api/state` | Clear all members and expenses |
| `POST` | `/api/settlement` | Calculate balances and recommended payments |

Example expense request:

```json
{
  "title": "Dinner",
  "amount": 100,
  "payer": "Alice",
  "beneficiaries": ["Alice", "Bob"]
}
```

Example settlement response:

```json
{
  "balances": {
    "Alice": 50,
    "Bob": -50
  },
  "transactions": [
    {
      "from": "Bob",
      "to": "Alice",
      "amount": 50
    }
  ]
}
```

## How Settlement Works

Each expense credits the person who paid and divides the expense equally across its selected beneficiaries. The server then separates people who owe money from people who should receive money and matches those balances using a greedy settlement algorithm.

For example, if Alice pays ₦100 for Alice and Bob, Alice receives a ₦50 credit and Bob owes ₦50. The suggested payment is:

```text
Bob pays Alice ₦50
```

## Development Notes

The current version stores one shared group in `data/bitsplitter.json`. It is suitable for local use, demos, and early product development. It does not yet provide user accounts, authentication, multiple independent groups, or database-level concurrency control.

For production, the next backend steps should be:

1. Replace the JSON datastore with SQLite or PostgreSQL.
2. Add users, groups, invitations, and authorization.
3. Validate requests with a schema validation library.
4. Store currency values as integer minor units to avoid floating-point rounding issues.
5. Add automated tests for settlement edge cases and API validation.
6. Add logging, security headers, rate limiting, and centralized error handling.

## Testing

The project currently does not have an automated test suite configured. The basic manual verification flow is:

1. Start the server with `npm start`.
2. Open `http://localhost:3000`.
3. Add at least two members.
4. Record an expense shared by those members.
5. Select **Compute Optimized Balances**.
6. Confirm that the dashboard and receipt show the expected totals and payment.
