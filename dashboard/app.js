const form = document.getElementById('launch-form');
const select = document.getElementById('suite');
const runButton = document.getElementById('run');
const status = document.getElementById('status');

function setStatus(message, kind = '') {
    status.textContent = message;
    if (kind) {
        status.dataset.kind = kind;
    } else {
        delete status.dataset.kind;
    }
}

function setBusy(busy) {
    runButton.disabled = busy;
    select.disabled = busy;
    runButton.setAttribute('aria-busy', busy ? 'true' : 'false');
}

async function loadSuites() {
    const response = await fetch('/api/suites');
    if (!response.ok) {
        throw new Error('Could not load suites');
    }
    const data = await response.json();
    for (const suite of data.suites) {
        const option = document.createElement('option');
        option.value = suite.id;
        option.textContent = suite.script;
        select.append(option);
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = select.value;
    if (!id) {
        setStatus('Select a suite before running.', 'error');
        return;
    }

    setBusy(true);
    setStatus(`Running ${id}…`);

    try {
        const response = await fetch('/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const data = await response.json();
        if (response.status === 409 || data.reason === 'busy') {
            setStatus('A scan is already running.', 'error');
            return;
        }
        if (!response.ok || !data.ok) {
            setStatus(data.reason === 'no-selection' ? 'Select a suite before running.' : 'Could not start that suite.', 'error');
            return;
        }
        setStatus(`${id} finished (exit ${data.code ?? 0}).`);
    } catch {
        setStatus('Could not reach the dashboard server.', 'error');
    } finally {
        setBusy(false);
    }
});

try {
    await loadSuites();
} catch {
    setStatus('Could not load site tests from package.json.', 'error');
    runButton.disabled = true;
}
