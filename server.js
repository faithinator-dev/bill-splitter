const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, 'public');
const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'bitsplitter.json');

app.use(express.json());
app.use(express.static(publicDirectory));

function readState() {
    if (!fs.existsSync(dataFile)) return { members: [], expenses: [] };
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeState(state) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
}

function errorResponse(response, status, message) {
    return response.status(status).json({ error: message });
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

app.get('/api/state', (request, response) => response.json(readState()));

app.get('/api/summary', (request, response) => {
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

app.post('/api/members', (request, response) => {
    const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
    if (!name) return errorResponse(response, 400, 'Member name is required.');
    const state = readState();
    if (state.members.includes(name)) return errorResponse(response, 409, 'Member already exists in this group.');
    state.members.push(name);
    writeState(state);
    response.status(201).json(state);
});

app.delete('/api/members/:name', (request, response) => {
    const state = readState();
    state.members = state.members.filter(member => member !== request.params.name);
    state.expenses = state.expenses
        .map(expense => ({ ...expense, beneficiaries: expense.beneficiaries.filter(member => member !== request.params.name) }))
        .filter(expense => expense.payer !== request.params.name && expense.beneficiaries.length > 0);
    writeState(state);
    response.json(state);
});

app.post('/api/expenses', (request, response) => {
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

app.delete('/api/expenses/:id', (request, response) => {
    const state = readState();
    state.expenses = state.expenses.filter(expense => String(expense.id) !== request.params.id);
    writeState(state);
    response.json(state);
});

app.delete('/api/state', (request, response) => {
    const state = { members: [], expenses: [] };
    writeState(state);
    response.json(state);
});

app.post('/api/settlement', (request, response) => {
    const state = readState();
    if (state.members.length < 2) return errorResponse(response, 400, 'Add at least 2 group members to calculate settlements.');
    if (state.expenses.length === 0) return errorResponse(response, 400, 'Please record at least one expense first.');
    response.json(calculateSettlement(state.members, state.expenses));
});

app.use((request, response) => response.sendFile(path.join(publicDirectory, 'index.html')));

app.listen(port, () => console.log(`BillSplitter server running at http://localhost:${port}`));