const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/expenses';
const AUTH_URL = API_URL.replace('/expenses', '');

// Fallback for non-secure contexts (HTTP)
function safeUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// State
let token = localStorage.getItem('token');
let isRegisterMode = false;
let currentExpenseId = null;
let currentPage = 1;

// Elements
const authOverlay = document.getElementById('authOverlay');
const authForm = document.getElementById('authForm');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const toggleAuthMode = document.getElementById('toggleAuthMode');
const userProfile = document.getElementById('userProfile');
const userNameDisplay = document.getElementById('userNameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const expenseForm = document.getElementById('expenseForm');
const expenseList = document.getElementById('expenseList');
const totalAmountDisplay = document.getElementById('totalAmount');
const categorySummary = document.getElementById('categorySummary');
const filterCategory = document.getElementById('filterCategory');
const sortDate = document.getElementById('sortDate');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');
const loadingState = document.getElementById('loadingState');
const submitBtn = document.getElementById('submitBtn');

// Auth Handlers
toggleAuthMode.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').textContent = isRegisterMode ? 'Create Account' : 'Welcome to FinanceFlow';
    document.getElementById('authSubtitle').textContent = isRegisterMode ? 'Join us to start tracking' : 'Please log in to manage your expenses';
    authSubmitBtn.textContent = isRegisterMode ? 'Register' : 'Login';
    document.getElementById('toggleText').textContent = isRegisterMode ? 'Already have an account?' : "Don't have an account?";
    toggleAuthMode.textContent = isRegisterMode ? 'Login' : 'Register';
    authError.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';
    const username = document.getElementById('authUsername').value;
    const password = document.getElementById('authPassword').value;

    const endpoint = isRegisterMode ? '/register' : '/login';

    try {
        const response = await fetch(`${AUTH_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Auth failed');

        if (isRegisterMode) {
            alert('Registered successfully! Please login.');
            toggleAuthMode.click();
        } else {
            token = data.token;
            localStorage.setItem('token', token);
            localStorage.setItem('username', data.user.username);
            onLoginSuccess(data.user.username);
        }
    } catch (err) {
        authError.textContent = err.message;
        authError.style.display = 'block';
    }
});

function onLoginSuccess(username) {
    authOverlay.style.display = 'none';
    userProfile.style.display = 'flex';
    userNameDisplay.textContent = `Hi, ${username}`;
    initializeApp();
}

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    location.reload();
});

// Expense Logic
async function fetchExpenses() {
    loadingState.style.display = 'flex';
    expenseList.style.display = 'none';

    const cat = filterCategory.value;
    const sort = sortDate.value;
    const url = `${API_URL}?page=${currentPage}&limit=5&category=${cat}&sort=${sort}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) logoutBtn.click();

        const { data, pagination } = await response.json();
        renderExpenses(data);
        updatePagination(pagination);
    } catch (error) {
        console.error('Fetch error:', error);
    } finally {
        loadingState.style.display = 'none';
        expenseList.style.display = 'block';
    }
}

async function fetchSummary() {
    try {
        const response = await fetch(`${API_URL}/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        renderSummary(data);
    } catch (err) { console.error('Summary error:', err); }
}

function renderExpenses(expenses) {
    if (expenses.length === 0) {
        expenseList.innerHTML = '<div class="empty-state">No records found.</div>';
        totalAmountDisplay.textContent = '₹0.00';
        return;
    }

    let total = 0;
    expenseList.innerHTML = expenses.map(exp => {
        total += parseFloat(exp.amount);
        return `
            <div class="expense-item">
                <div class="expense-info">
                    <div class="expense-category">${exp.category}</div>
                    <div style="font-weight: 500">${exp.description}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted)">${new Date(exp.date).toLocaleDateString()}</div>
                </div>
                <div class="expense-amount">₹${parseFloat(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
        `;
    }).join('');
    totalAmountDisplay.textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function renderSummary(summary) {
    categorySummary.innerHTML = summary.map(item => `
        <div class="cat-bubble">
            <span class="cat-bubble-name">${item.category}</span>
            <span class="cat-bubble-amount">₹${parseFloat(item.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
    `).join('');
}

function updatePagination(p) {
    pageInfo.textContent = `Page ${p.page} of ${p.totalPages || 1}`;
    prevPageBtn.disabled = p.page <= 1;
    nextPageBtn.disabled = p.page >= p.totalPages;
}

expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('amount').value;
    if (!currentExpenseId) currentExpenseId = safeUUID();

    const payload = {
        id: currentExpenseId,
        amount,
        category: document.getElementById('category').value,
        description: document.getElementById('description').value,
        date: document.getElementById('date').value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Recording...';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Failed to save');

        currentExpenseId = null;
        expenseForm.reset();
        document.getElementById('date').valueAsDate = new Date();
        currentPage = 1;
        await Promise.all([fetchExpenses(), fetchSummary()]);
    } catch (err) { alert(err.message); }
    finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Record Expense';
    }
});

filterCategory.addEventListener('change', () => { currentPage = 1; fetchExpenses(); });
sortDate.addEventListener('change', () => { currentPage = 1; fetchExpenses(); });
prevPageBtn.addEventListener('click', () => { currentPage--; fetchExpenses(); });
nextPageBtn.addEventListener('click', () => { currentPage++; fetchExpenses(); });

function initializeApp() {
    document.getElementById('date').valueAsDate = new Date();
    fetchExpenses();
    fetchSummary();
}

// Initial session check
if (token) {
    onLoginSuccess(localStorage.getItem('username') || 'User');
} else {
    authOverlay.style.display = 'flex';
}
