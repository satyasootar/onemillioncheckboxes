const checkboxContainer = document.getElementById('checkbox-container');
const socket = io();

const TOTAL_CHECKBOXES = 1000000;
const CHUNK_SIZE = 500;
let currentIndex = 0;
let globalState = [];

// Sentinel element for intersection observer
const sentinel = document.createElement('div');
sentinel.id = 'sentinel';
sentinel.style.width = '100%';
sentinel.style.height = '40px'; 
sentinel.style.gridColumn = '1 / -1'; // span full width of grid

window.addEventListener('load', async () => {
    try {
        const response = await fetch('/checkbox-state');
        const data = await response.json();
        globalState = data.state || [];
        
        // Initial render
        renderNextChunk();
        
        // Setup observer to load more chunks as user scrolls
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                renderNextChunk();
            }
        }, { rootMargin: '400px' }); // start loading 400px before bottom
        
        observer.observe(sentinel);

    } catch (error) {
        console.error('Error fetching checkbox state:', error);
    }
});

function renderNextChunk() {
    if (currentIndex >= TOTAL_CHECKBOXES) return;

    // Temporarily remove sentinel
    if (sentinel.parentNode) {
        sentinel.parentNode.removeChild(sentinel);
    }

    const fragment = document.createDocumentFragment();
    const end = Math.min(currentIndex + CHUNK_SIZE, TOTAL_CHECKBOXES);

    for (let i = currentIndex; i < end; i++) {
        const listItem = document.createElement("input");
        listItem.type = 'checkbox';
        listItem.id = `cb-${i}`;
        
        if (globalState[i]) {
            listItem.checked = true;
        }
        
        // Remove individual delay animations to prevent extreme lag with infinite scroll
        listItem.className = 'checkbox-enter';

        listItem.addEventListener('change', (event) => {
            const checked = event.target.checked;
            globalState[i] = checked;
            socket.emit('checkbox-change', { index: i, checked });
        });
        
        fragment.appendChild(listItem);
    }

    checkboxContainer.appendChild(fragment);
    currentIndex = end;

    // Add sentinel back to the bottom
    if (currentIndex < TOTAL_CHECKBOXES) {
        checkboxContainer.appendChild(sentinel);
    }
}

socket.on('server:error', (error) => {
    if (typeof error === 'string') {
        showToast(error);
    } else {
        console.log('Received error object:', error);
        showToast(error.message || JSON.stringify(error));
        if (error.data) {
            const { index, checked } = error.data;
            const checkbox = document.getElementById(`cb-${index}`);
            if (checkbox) {
                checkbox.checked = !checked;
                globalState[index] = !checked;
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

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200); 
    }, 4000);
}

socket.on('checkbox-update', (data) => {
    const { index, checked } = data;
    globalState[index] = checked; // Keep state updated even if not rendered yet
    
    const checkbox = document.getElementById(`cb-${index}`);
    if (checkbox) {
        checkbox.checked = checked;
        
        checkbox.style.transition = 'none';
        checkbox.style.borderColor = '#f5a623';
        setTimeout(() => {
            checkbox.style.transition = '';
            checkbox.style.borderColor = '';
        }, 150);
    }
});