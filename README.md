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
- Local account registration and login with protected workspace access
- Equal splitting with the payer excluded by default, plus an option to include them

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

Open the landing page at:

```text
http://localhost:3000
```

Select **Open workspace** to sign in or create an account. The expense workspace is available at `/app` after authentication.

To use another port on Windows PowerShell:

```powershell
$env:PORT=4000; npm start
```

## Deployment

BitSplitter must be deployed as a Node/Express web service because account creation, login, sessions, and expense APIs run in `server.js`. Configure the deployment with:

- Build/install command: `npm install`
- Start command: `npm start`
- Health check: `GET /api/health`

The health check should return JSON similar to:

```json
{ "ok": true, "service": "bitsplitter-api" }
```

Do not deploy only the `public/` folder to GitHub Pages or another static-only host. Static hosting cannot run `/api/auth/register`, which causes the browser to receive an HTML page and produce `Unexpected token '<'` while parsing the response as JSON.

## Project Structure

```text
.
├── public/
│   ├── index.html   # Public landing page
│   ├── app.html     # Authenticated expense workspace
│   ├── login.html   # Sign-in and account registration page
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
| `POST` | `/api/auth/register` | Create an account and start a session |
| `POST` | `/api/auth/login` | Sign in and start a session |
| `POST` | `/api/auth/logout` | End the current session |
| `GET` | `/api/auth/me` | Return the current signed-in user |

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

Each expense credits the person who paid and divides the expense equally across its selected beneficiaries. In the workspace, the payer is excluded from the selected beneficiaries by default because they already paid. Turn on **Include the payer in the equal split** when the payer also consumed the expense. The server then separates people who owe money from people who should receive money and matches those balances using a greedy settlement algorithm.

For example, if Alice pays ₦100 for Alice and Bob, Alice receives a ₦50 credit and Bob owes ₦50. The suggested payment is:

```text
Bob pays Alice ₦50
```

## Development Notes

The current version stores one shared group in `data/bitsplitter.json` and local accounts in `data/users.json`. It is suitable for local use, demos, and early product development. Sessions are held in server memory, so restarting the server signs users out. The app does not yet provide multiple independent groups or database-level concurrency control.

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
