const checkboxContainer = document.getElementById('checkbox-container');
const socket = io();

const TOTAL_CHECKBOXES = 1000000;
const CHUNK_SIZE = 500;
let currentIndex = 0;
let globalState = [];

// Auth state
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');

const loggedOutView = document.getElementById('logged-out-view');
const loggedInView = document.getElementById('logged-in-view');
const currentUserSpan = document.getElementById('current-user');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const customTooltip = document.getElementById('custom-tooltip');
const feedList = document.getElementById('feed-list');

// Feed Logic
function addFeedItem(html, isLogin = false) {
    // Remove placeholder if present
    const placeholder = feedList.querySelector('.feed-placeholder');
    if (placeholder) placeholder.remove();

    const li = document.createElement('li');
    li.className = `feed-item ${isLogin ? 'login' : ''}`;
    li.innerHTML = html;
    feedList.prepend(li);
    
    // Keep feed trimmed to last 50 items
    if (feedList.children.length > 50) {
        feedList.removeChild(feedList.lastChild);
    }
}

function renderHistory(history) {
    feedList.innerHTML = '';
    
    if (history.length === 0) {
        feedList.innerHTML = '<li class="feed-placeholder">Waiting for activity...</li>';
        return;
    }

    const isMe = (user) => user === username ? 'You' : user;

    // History comes in newest first, so we append them sequentially 
    history.forEach(item => {
        const li = document.createElement('li');
        li.className = `feed-item ${item.type === 'joined' || item.type === 'registered' ? 'login' : ''}`;
        
        // Remove animation to prevent huge lag spike when rendering 50 historic items
        li.style.animation = 'none';
        li.style.opacity = '1';
        li.style.transform = 'translateX(0)';

        let html = '';
        if (item.type === 'joined') {
            html = `<strong>${isMe(item.user)}</strong> logged in.`;
        } else if (item.type === 'registered') {
            html = `<strong>${isMe(item.user)}</strong> registered a new account! 🎉`;
        } else if (item.type === 'checkbox') {
            const action = item.checked ? 'checked' : 'unchecked';
            html = `<strong>${isMe(item.by)}</strong> ${action} box <strong>#${item.index}</strong>`;
        }
        
        li.innerHTML = html;
        feedList.appendChild(li);
    });
}


function updateAuthUI() {
    if (token) {
        loggedOutView.style.display = 'none';
        loggedInView.style.display = 'block';
        currentUserSpan.textContent = username;
    } else {
        loggedOutView.style.display = 'block';
        loggedInView.style.display = 'none';
    }
}
updateAuthUI();

async function handleAuth(endpoint) {
    const u = usernameInput.value;
    const p = passwordInput.value;
    if (!u || !p) return showToast("Enter username and password");

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        
        if (res.ok) {
            if (endpoint === '/register') {
                socket.emit('user-registered', u);
            }
            if (data.token) {
                token = data.token;
                username = data.username;
                localStorage.setItem('token', token);
                localStorage.setItem('username', username);
                updateAuthUI();
                usernameInput.value = '';
                passwordInput.value = '';
                
                // Broadcast login globally if it was a direct login
                if (endpoint === '/login') {
                    socket.emit('user-joined', username);
                }
            }
            showToast(data.message || "Success");
        } else {
            showToast(data.error);
        }
    } catch(err) {
        showToast("Network error");
    }
}

document.getElementById('login-btn').addEventListener('click', () => handleAuth('/login'));
document.getElementById('register-btn').addEventListener('click', () => handleAuth('/register'));
document.getElementById('logout-btn').addEventListener('click', () => {
    token = null;
    username = null;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    updateAuthUI();
    
    // Refresh history locally so that "You" reverts back to the username
    fetch('/feed-history')
        .then(res => res.json())
        .then(data => renderHistory(data.history || []));
        
    showToast("Logged out successfully");
});

// Tooltip logic via event delegation
checkboxContainer.addEventListener('mouseover', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
        const id = e.target.id;
        const index = parseInt(id.replace('cb-', ''), 10);
        const owner = globalState[index];
        
        if (owner) {
            customTooltip.textContent = `Checked by: ${owner}`;
            const rect = e.target.getBoundingClientRect();
            customTooltip.style.left = `${rect.left + rect.width / 2}px`;
            customTooltip.style.top = `${rect.top - 8}px`; 
            customTooltip.classList.add('show');
        }
    }
});

checkboxContainer.addEventListener('mouseout', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
        customTooltip.classList.remove('show');
    }
});

// Infinite Scroll Sentinel
const sentinel = document.createElement('div');
sentinel.id = 'sentinel';
sentinel.style.width = '100%';
sentinel.style.height = '40px'; 
sentinel.style.gridColumn = '1 / -1';

window.addEventListener('load', async () => {
    try {
        const [stateRes, feedRes] = await Promise.all([
            fetch('/checkbox-state'),
            fetch('/feed-history')
        ]);
        
        const data = await stateRes.json();
        globalState = data.state || [];

        const feedData = await feedRes.json();
        renderHistory(feedData.history || []);
        
        renderNextChunk();
        
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                renderNextChunk();
            }
        }, { rootMargin: '400px' });
        
        observer.observe(sentinel);

    } catch (error) {
        console.error('Error fetching data:', error);
    }
});

function renderNextChunk() {
    if (currentIndex >= TOTAL_CHECKBOXES) return;
    if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);

    const fragment = document.createDocumentFragment();
    const end = Math.min(currentIndex + CHUNK_SIZE, TOTAL_CHECKBOXES);

    for (let i = currentIndex; i < end; i++) {
        const listItem = document.createElement("input");
        listItem.type = 'checkbox';
        listItem.id = `cb-${i}`;
        
        if (globalState[i]) {
            listItem.checked = true;
        }
        
        listItem.className = 'checkbox-enter';

        listItem.addEventListener('change', (event) => {
            if (!token) {
                event.preventDefault();
                event.target.checked = !event.target.checked;
                showToast("Please login first to check boxes!");
                return;
            }

            const checked = event.target.checked;
            globalState[i] = checked ? username : null;
            if (!checked) {
                customTooltip.classList.remove('show');
            } else {
                customTooltip.textContent = `Checked by: ${username}`;
                const rect = event.target.getBoundingClientRect();
                customTooltip.style.left = `${rect.left + rect.width / 2}px`;
                customTooltip.style.top = `${rect.top - 8}px`;
                customTooltip.classList.add('show');
            }
            socket.emit('checkbox-change', { index: i, checked, token });
        });
        
        fragment.appendChild(listItem);
    }

    checkboxContainer.appendChild(fragment);
    currentIndex = end;

    if (currentIndex < TOTAL_CHECKBOXES) {
        checkboxContainer.appendChild(sentinel);
    }
}

// Socket Events
socket.on('user-joined', (user) => {
    const name = (user === username) ? 'You' : user;
    addFeedItem(`<strong>${name}</strong> logged in.`, true);
});

socket.on('user-registered', (user) => {
    const name = (user === username) ? 'You' : user;
    addFeedItem(`<strong>${name}</strong> registered a new account! 🎉`, true);
});

socket.on('checkbox-update', (data) => {
    const { index, checked, by } = data;
    
    if (by) {
        const name = (by === username) ? 'You' : by;
        const action = checked ? 'checked' : 'unchecked';
        addFeedItem(`<strong>${name}</strong> ${action} box <strong>#${index}</strong>`);
    }

    globalState[index] = checked ? by : null; 
    
    const checkbox = document.getElementById(`cb-${index}`);
    if (checkbox) {
        checkbox.checked = checked;
        
        checkbox.style.transition = 'none';
        checkbox.style.borderColor = '#f5a623';
        setTimeout(() => {
            checkbox.style.transition = '';
            checkbox.style.borderColor = '';
        }, 150);

        if (customTooltip.classList.contains('show')) {
            const currentHoverId = document.querySelector(':hover')?.id;
            if (currentHoverId === `cb-${index}`) {
                if (checked) {
                    customTooltip.textContent = `Checked by: ${by}`;
                } else {
                    customTooltip.classList.remove('show');
                }
            }
        }
    }
});

socket.on('server:error', (error) => {
    showToast(error.message || JSON.stringify(error));
    if (error.data) {
        const { index, checked } = error.data;
        const checkbox = document.getElementById(`cb-${index}`);
        if (checkbox) {
            checkbox.checked = !checked;
            globalState[index] = !checked ? "unknown" : null;
            if (checked) {
                customTooltip.classList.remove('show');
            }
        }
    }
});

function showToast(message) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    toastContainer.appendChild(toast);
    void toast.offsetWidth;
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200); 
    }, 4000);
}