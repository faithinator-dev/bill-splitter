const memberNameInput = document.getElementById('memberNameInput');
const membersContainer = document.getElementById('membersContainer');
const payerSelect = document.getElementById('payerSelect');
const splitCheckboxes = document.getElementById('splitCheckboxes');
const expenseList = document.getElementById('expenseList');
const receiptWrapper = document.getElementById('receiptWrapper');
const receiptTransactions = document.getElementById('receiptTransactions');
const receiptDate = document.getElementById('receiptDate');
const totalSpent = document.getElementById('totalSpent');
const memberCount = document.getElementById('memberCount');
const expenseCount = document.getElementById('expenseCount');
const settlementCount = document.getElementById('settlementCount');
const balanceSummary = document.getElementById('balanceSummary');
const includePayer = document.getElementById('includePayer');
let state = { members: [], expenses: [] };

async function api(url, options = {}) {
	const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
	const payload = await response.json();
	if (response.status === 401) {
		window.location.href = '/login';
		throw new Error('Your session has expired.');
	}
	if (!response.ok) throw new Error(payload.error || 'The server could not complete that request.');
	return payload;
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

function showError(error) { window.alert(error.message); }

function renderMembers() {
	membersContainer.innerHTML = state.members.length
		? state.members.map(member => `<div class="member-chip"><span>${escapeHtml(member)}</span><button onclick="removeMember(${JSON.stringify(member)})"><i class="fa-solid fa-xmark"></i></button></div>`).join('')
		: '<span style="font-size:0.85rem; color:var(--text-muted);">No members added yet.</span>';
	payerSelect.innerHTML = '<option value="" disabled selected>Select member</option>' + state.members.map(member => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`).join('');
	splitCheckboxes.innerHTML = state.members.map(member => `<label class="checkbox-label"><input type="checkbox" value="${escapeHtml(member)}" checked><span>${escapeHtml(member)}</span></label>`).join('');
	updatePayerSplit();
}

function updatePayerSplit() {
	const payer = payerSelect.value;
	const boxes = Array.from(splitCheckboxes.querySelectorAll('input'));
	boxes.forEach(input => { input.disabled = false; });
	const payerBox = boxes.find(input => input.value === payer);
	if (!payerBox) return;
	payerBox.disabled = !includePayer.checked;
	payerBox.checked = includePayer.checked;
}

function renderExpenses() {
	expenseList.innerHTML = state.expenses.length
		? state.expenses.slice().reverse().map(expense => `<div class="expense-item"><div class="expense-info"><h4>${escapeHtml(expense.title)}</h4><p>Paid by <strong>${escapeHtml(expense.payer)}</strong> for [${expense.beneficiaries.map(escapeHtml).join(', ')}]</p></div><div style="display:flex; align-items:center; gap:1rem;"><span class="expense-amount">₦${expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span><button onclick="deleteExpense(${expense.id})" style="background:none; border:none; color:#FF5252; cursor:pointer;"><i class="fa-solid fa-trash"></i></button></div></div>`).join('')
		: '<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:1.5rem 0;">No expenses recorded yet.</div>';
}

function render() { renderMembers(); renderExpenses(); }

function formatMoney(amount) {
	return `₦${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function renderSummary() {
	const summary = await api('/api/summary');
	totalSpent.textContent = formatMoney(summary.totalSpent);
	memberCount.textContent = summary.memberCount;
	expenseCount.textContent = summary.expenseCount;
	settlementCount.textContent = summary.transactions.length ? `${summary.transactions.length} payment${summary.transactions.length === 1 ? '' : 's'}` : summary.expenseCount ? 'All settled' : 'Add your first expense';
	balanceSummary.textContent = summary.transactions.length ? `${summary.transactions[0].from} pays ${summary.transactions[0].to} ${formatMoney(summary.transactions[0].amount)}` : summary.expenseCount ? 'No payments needed right now' : 'No balances to settle yet';
}

async function refresh() { state = await api('/api/state'); render(); await renderSummary(); }

async function addMember() {
	try { state = await api('/api/members', { method: 'POST', body: JSON.stringify({ name: memberNameInput.value }) }); memberNameInput.value = ''; render(); await renderSummary(); } catch (error) { showError(error); }
}

async function removeMember(name) {
	try { state = await api(`/api/members/${encodeURIComponent(name)}`, { method: 'DELETE' }); render(); await renderSummary(); } catch (error) { showError(error); }
}

async function addExpense(event) {
	event.preventDefault();
	const beneficiaries = Array.from(splitCheckboxes.querySelectorAll('input:checked')).map(input => input.value);
	try {
		state = await api('/api/expenses', { method: 'POST', body: JSON.stringify({ title: document.getElementById('expenseTitle').value.trim(), amount: document.getElementById('expenseAmount').value, payer: payerSelect.value, beneficiaries }) });
		event.target.reset();
		render();
		await renderSummary();
	} catch (error) { showError(error); }
}

payerSelect.addEventListener('change', updatePayerSplit);
includePayer.addEventListener('change', updatePayerSplit);

async function deleteExpense(id) {
	try { state = await api(`/api/expenses/${id}`, { method: 'DELETE' }); render(); await renderSummary(); } catch (error) { showError(error); }
}

async function clearAllData() {
	if (!window.confirm('Are you sure you want to clear all members and expenses?')) return;
	try { state = await api('/api/state', { method: 'DELETE' }); receiptWrapper.style.display = 'none'; render(); await renderSummary(); } catch (error) { showError(error); }
}

async function calculateSettlement() {
	try {
		const result = await api('/api/settlement', { method: 'POST' });
		receiptDate.textContent = `DATE: ${new Date().toLocaleDateString()} | TIME: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		receiptTransactions.innerHTML = result.transactions.length
			? result.transactions.map(transaction => `<div class="transaction-line"><span><span class="payer">${escapeHtml(transaction.from)}</span> pays <span class="payee">${escapeHtml(transaction.to)}</span></span><span style="font-weight:700;">₦${transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>`).join('')
			: '<p style="text-align:center; padding:1rem 0; font-weight:bold;">All balances are even! No one owes anything.</p>';
		receiptWrapper.style.display = 'block';
		receiptWrapper.scrollIntoView({ behavior: 'smooth' });
	} catch (error) { showError(error); }
}

async function logout() {
	await fetch('/api/auth/logout', { method: 'POST' });
	window.location.href = '/';
}

refresh().catch(showError);
