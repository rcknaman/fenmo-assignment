const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/expenses';
console.log("🚀 FinanceFlow API URL:", API_URL);

// Fallback for non-secure contexts (HTTP) where crypto.randomUUID is unavailable
function safeUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


const expenseForm = document.getElementById('expenseForm');
const expenseList = document.getElementById('expenseList');
const totalAmountDisplay = document.getElementById('totalAmount');
const categorySummary = document.getElementById('categorySummary');
const filterCategory = document.getElementById('filterCategory');
const sortDate = document.getElementById('sortDate');
const submitBtn = document.getElementById('submitBtn');
const formError = document.getElementById('formError');
const loadingState = document.getElementById('loadingState');

const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');

let currentPage = 1;
const ITEMS_PER_PAGE = 5;

// Initialize date input
document.getElementById('date').valueAsDate = new Date();

async function fetchSummary() {
    try {
        const response = await fetch(`${API_URL}/summary`);
        if (!response.ok) throw new Error('Failed to fetch summary');
        const summary = await response.json();
        renderSummary(summary);
    } catch (error) {
        console.error('Summary fetch error:', error);
    }
}

function renderSummary(summary) {
    categorySummary.innerHTML = summary.map(item => `
        <div class="cat-bubble">
            <span class="cat-bubble-name">${item.category}</span>
            <span class="cat-bubble-amount">₹${parseFloat(item.total).toLocaleString()}</span>
        </div>
    `).join('');
}

async function fetchExpenses() {
    const category = filterCategory.value;
    const sort = sortDate.value;

    loadingState.style.display = 'flex';
    expenseList.style.display = 'none';

    let url = `${API_URL}?page=${currentPage}&limit=${ITEMS_PER_PAGE}&`;
    if (category) url += `category=${category}&`;
    if (sort) url += `sort=${sort}`;

    try {
        const response = await fetch(url);
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment.');
        }
        if (!response.ok) throw new Error('Failed to fetch expenses');

        const result = await response.json();
        renderExpenses(result.data);
        renderPagination(result.pagination);
    } catch (error) {
        console.error(error);
        expenseList.innerHTML = `<div class="empty-state" style="color: var(--danger-color)">${error.message}</div>`;
        expenseList.style.display = 'block';
    } finally {
        loadingState.style.display = 'none';
    }
}

function renderExpenses(expenses) {
    expenseList.style.display = 'block';
    if (expenses.length === 0) {
        expenseList.innerHTML = `<div class="empty-state">No expenses found.</div>`;
        return;
    }

    expenseList.innerHTML = expenses.map(exp => `
        <div class="expense-item" data-id="${exp.id}">
            <div class="expense-info">
                <span class="expense-category">${exp.category}</span>
                <span class="expense-description">${exp.description}</span>
                <span class="expense-date">${new Date(exp.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
            </div>
            <div class="expense-amount">₹${parseFloat(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
    `).join('');

    // Update main total based on the entire view (this could be from the summary or a separate calculation)
    // For simplicity, we'll fetch the summary to update global state
    updateTotalAmount(expenses);
}

function updateTotalAmount(expensesInView) {
    // Note: The total in the summary is more accurate for global state
    // But requirement says "total of expenses for the current list"
    const total = expensesInView.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    totalAmountDisplay.textContent = `₹${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function renderPagination(pagination) {
    pageInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1}`;
    prevPageBtn.disabled = pagination.page <= 1;
    nextPageBtn.disabled = pagination.page >= pagination.totalPages;
}

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        fetchExpenses();
    }
});

nextPageBtn.addEventListener('click', () => {
    currentPage++;
    fetchExpenses();
});

let currentExpenseId = null;

expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.style.display = 'none';

    const amount = document.getElementById('amount').value;
    if (parseFloat(amount) <= 0) {
        showFormError('Amount must be positive');
        return;
    }

    // Reuse ID for retries to ensure idempotency
    if (!currentExpenseId) {
        currentExpenseId = safeUUID();
    }

    const expenseData = {
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to save expense');
        }

        // Success: Reset ID for the next potentially distinct entry
        currentExpenseId = null;
        expenseForm.reset();
        document.getElementById('date').valueAsDate = new Date();
        currentPage = 1;
        await Promise.all([fetchExpenses(), fetchSummary()]);
    } catch (error) {
        showFormError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Record Expense';
    }
});

function showFormError(msg) {
    formError.textContent = msg;
    formError.style.display = 'block';
}

filterCategory.addEventListener('change', () => {
    currentPage = 1;
    fetchExpenses();
});

sortDate.addEventListener('change', fetchExpenses);

// Initial load
fetchExpenses();
fetchSummary();
setInterval(fetchSummary, 60000); // Update summary every minute
