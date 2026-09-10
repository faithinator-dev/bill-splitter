const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, 'public');
const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'bitsplitter.json');
const usersFile = path.join(dataDirectory, 'users.json');
const sessions = new Map();

app.use(express.json());
app.use(express.static(publicDirectory));

app.post('/api/auth/register', (request, response) => {
    const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body.password === 'string' ? request.body.password : '';
    if (!name || !email || password.length < 6) return errorResponse(response, 400, 'Enter a name, email, and password of at least 6 characters.');
    const users = readUsers();
    if (users.some(user => user.email === email)) return errorResponse(response, 409, 'An account with that email already exists.');
    const user = { id: crypto.randomUUID(), name, email, password: hashPassword(password) };
    users.push(user);
    writeUsers(users);
    const token = crypto.randomUUID();
    sessions.set(token, { id: user.id, name: user.name, email: user.email });
    response.setHeader('Set-Cookie', `bitsplitter_session=${token}; HttpOnly; SameSite=Lax; Path=/`);
    response.status(201).json({ user: sessions.get(token) });
});

app.post('/api/auth/login', (request, response) => {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body.password === 'string' ? request.body.password : '';
    const user = readUsers().find(candidate => candidate.email === email);
    if (!user || !passwordsMatch(password, user.password)) return errorResponse(response, 401, 'Email or password is incorrect.');
    const token = crypto.randomUUID();
    sessions.set(token, { id: user.id, name: user.name, email: user.email });
    response.setHeader('Set-Cookie', `bitsplitter_session=${token}; HttpOnly; SameSite=Lax; Path=/`);
    response.json({ user: sessions.get(token) });
});

app.post('/api/auth/logout', (request, response) => {
    const token = request.headers.cookie?.match(/bitsplitter_session=([^;]+)/)?.[1];
    if (token) sessions.delete(token);
    response.setHeader('Set-Cookie', 'bitsplitter_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/');
    response.json({ success: true });
});

app.get('/api/auth/me', (request, response) => {
    const user = currentUser(request);
    if (!user) return errorResponse(response, 401, 'Not logged in.');
    response.json({ user });
});

app.get('/api/health', (request, response) => response.json({ ok: true, service: 'bitsplitter-api' }));

function readState() {
    if (!fs.existsSync(dataFile)) return { members: [], expenses: [] };
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeState(state) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
}

function readUsers() {
    if (!fs.existsSync(usersFile)) return [];
    return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
}

function writeUsers(users) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordsMatch(password, storedPassword) {
    const [salt, storedHash] = storedPassword.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function currentUser(request) {
    const token = request.headers.cookie?.match(/bitsplitter_session=([^;]+)/)?.[1];
    return token ? sessions.get(token) : null;
}

function errorResponse(response, status, message) {
    return response.status(status).json({ error: message });
}

function requireAuth(request, response, next) {
    if (!currentUser(request)) return errorResponse(response, 401, 'Please log in to continue.');
    next();
}

function calculateSettlement(members, expenses) {
    const balances = Object.fromEntries(members.map(member => [member, 0]));

    expenses.forEach(expense => {
        const share = expense.amount / expense.beneficiaries.length;
        if (balances[expense.payer] !== undefined) balances[expense.payer] += expense.amount;
        expense.beneficiaries.forEach(beneficiary => {
            if (balances[beneficiary] !== undefined) balances[beneficiary] -= share;
        });
    });

    const debtors = [];
    const creditors = [];
    Object.entries(balances).forEach(([person, balance]) => {
        if (balance < -0.01) debtors.push({ person, amount: -balance });
        if (balance > 0.01) creditors.push({ person, amount: balance });
    });

    const transactions = [];
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex];
        const creditor = creditors[creditorIndex];
        const amount = Math.min(debtor.amount, creditor.amount);
        transactions.push({ from: debtor.person, to: creditor.person, amount: Number(amount.toFixed(2)) });
        debtor.amount -= amount;
        creditor.amount -= amount;
        if (Math.abs(debtor.amount) < 0.01) debtorIndex += 1;
        if (Math.abs(creditor.amount) < 0.01) creditorIndex += 1;
    }

    return { balances, transactions };
}

app.get('/api/state', requireAuth, (request, response) => response.json(readState()));

app.get('/api/summary', requireAuth, (request, response) => {
    const state = readState();
    const settlement = state.members.length >= 2 && state.expenses.length > 0
        ? calculateSettlement(state.members, state.expenses)
        : { transactions: [] };
    response.json({
        totalSpent: Number(state.expenses.reduce((total, expense) => total + expense.amount, 0).toFixed(2)),
        memberCount: state.members.length,
        expenseCount: state.expenses.length,
        transactions: settlement.transactions
    });
});

app.post('/api/members', requireAuth, (request, response) => {
    const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
    if (!name) return errorResponse(response, 400, 'Member name is required.');
    const state = readState();
    if (state.members.includes(name)) return errorResponse(response, 409, 'Member already exists in this group.');
    state.members.push(name);
    writeState(state);
    response.status(201).json(state);
});

app.delete('/api/members/:name', requireAuth, (request, response) => {
    const state = readState();
    state.members = state.members.filter(member => member !== request.params.name);
    state.expenses = state.expenses
        .map(expense => ({ ...expense, beneficiaries: expense.beneficiaries.filter(member => member !== request.params.name) }))
        .filter(expense => expense.payer !== request.params.name && expense.beneficiaries.length > 0);
    writeState(state);
    response.json(state);
});

app.post('/api/expenses', requireAuth, (request, response) => {
    const { title, amount, payer, beneficiaries } = request.body;
    const state = readState();
    const numericAmount = Number(amount);
    const validBeneficiaries = Array.isArray(beneficiaries)
        ? beneficiaries.filter(member => state.members.includes(member))
        : [];
    if (!title || !Number.isFinite(numericAmount) || numericAmount <= 0) return errorResponse(response, 400, 'A title and a positive amount are required.');
    if (!state.members.includes(payer)) return errorResponse(response, 400, 'Payer must be a group member.');
    if (validBeneficiaries.length === 0) return errorResponse(response, 400, 'Select at least one group member.');
    state.expenses.push({ id: Date.now(), title: String(title).trim(), amount: numericAmount, payer, beneficiaries: validBeneficiaries });
    writeState(state);
    response.status(201).json(state);
});

app.delete('/api/expenses/:id', requireAuth, (request, response) => {
    const state = readState();
    state.expenses = state.expenses.filter(expense => String(expense.id) !== request.params.id);
    writeState(state);
    response.json(state);
});

app.delete('/api/state', requireAuth, (request, response) => {
    const state = { members: [], expenses: [] };
    writeState(state);
    response.json(state);
});

app.post('/api/settlement', requireAuth, (request, response) => {
    const state = readState();
    if (state.members.length < 2) return errorResponse(response, 400, 'Add at least 2 group members to calculate settlements.');
    if (state.expenses.length === 0) return errorResponse(response, 400, 'Please record at least one expense first.');
    response.json(calculateSettlement(state.members, state.expenses));
});

app.use('/api', (request, response) => {
    response.status(404).json({ error: `API route not found: ${request.method} ${request.path}` });
});

app.get('/', (request, response) => response.sendFile(path.join(publicDirectory, 'index.html')));
app.get('/app', (request, response) => {
    if (!currentUser(request)) return response.redirect('/login');
    response.sendFile(path.join(publicDirectory, 'app.html'));
});
app.get('/login', (request, response) => response.sendFile(path.join(publicDirectory, 'login.html')));
app.use((request, response) => response.sendFile(path.join(publicDirectory, 'index.html')));

app.listen(port, () => console.log(`BillSplitter server running at http://localhost:${port}`));