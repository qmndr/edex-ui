class AIDock {
    constructor(containerId) {
        this.containerId = containerId;
        this.isVisible = true;
        this.chatHistory = [];
        this.isLoading = false;
        this.provider = null;
        this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';
        this.ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
        this.ddgVqd = null;
        this.ddgModel = process.env.DDG_MODEL || 'gpt-4o-mini';
        
        this._createDock();
        this._bindEvents();
        this._detectProvider();
    }

    async _detectProvider() {
        const forcedProvider = process.env.EDEX_AI_PROVIDER;
        if (forcedProvider) {
            this.provider = forcedProvider;
            this._updateProviderStatus(`${forcedProvider} (forced)`);
            return;
        }

        const openrouterKey = process.env.OPENROUTER_API_KEY || (window.settings && window.settings.aiApiKey);
        if (openrouterKey) {
            this.provider = 'openrouter';
            this._updateProviderStatus('OpenRouter');
            return;
        }

        try {
            const ollamaAvailable = await this._checkOllama();
            if (ollamaAvailable) {
                this.provider = 'ollama';
                this._updateProviderStatus(`Ollama (${this.ollamaModel})`);
                return;
            }
        } catch (e) {}

        try {
            const ddgAvailable = await this._checkDuckDuckGo();
            if (ddgAvailable) {
                this.provider = 'duckduckgo';
                this._updateProviderStatus(`DuckDuckGo (${this.ddgModel})`);
                return;
            }
        } catch (e) {}

        try {
            const phindAvailable = await this._checkPhind();
            if (phindAvailable) {
                this.provider = 'phind';
                this._updateProviderStatus('Phind');
                return;
            }
        } catch (e) {}

        this._updateProviderStatus('No provider available');
    }

    async _checkOllama() {
        const http = require('http');
        const url = require('url');
        const parsed = url.parse(this.ollamaHost);
        
        return new Promise((resolve) => {
            const req = http.request({
                hostname: parsed.hostname,
                port: parsed.port || 11434,
                path: '/api/tags',
                method: 'GET',
                timeout: 2000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.models && result.models.length > 0) {
                            const hasModel = result.models.some(m => m.name.startsWith(this.ollamaModel));
                            if (!hasModel && result.models.length > 0) {
                                this.ollamaModel = result.models[0].name;
                            }
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    }
                });
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }

    async _checkDuckDuckGo() {
        const https = require('https');
        
        return new Promise((resolve) => {
            const options = {
                hostname: 'duckduckgo.com',
                port: 443,
                path: '/duckchat/v1/status',
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
                    'Accept': 'text/event-stream',
                    'x-vqd-accept': '1',
                    'Cache-Control': 'no-store'
                },
                timeout: 5000
            };

            const req = https.request(options, (res) => {
                const vqd = res.headers['x-vqd-4'];
                if (vqd) {
                    this.ddgVqd = vqd;
                    resolve(true);
                } else {
                    resolve(false);
                }
                res.resume();
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }

    async _checkPhind() {
        const https = require('https');
        
        return new Promise((resolve) => {
            const options = {
                hostname: 'https.extension.phind.com',
                port: 443,
                path: '/agent/',
                method: 'OPTIONS',
                headers: {
                    'User-Agent': '',
                    'Accept': '*/*'
                },
                timeout: 5000
            };

            const req = https.request(options, (res) => {
                resolve(res.statusCode < 500);
                res.resume();
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }

    _createDock() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('AI Dock container not found:', this.containerId);
            return;
        }

        container.innerHTML = `
            <div id="ai_dock_header">
                <h3>AI ASSISTANT</h3>
                <span id="ai_dock_provider">Detecting...</span>
                <button id="ai_dock_toggle" title="Switch to keyboard (F2)">KEYBOARD</button>
            </div>
            <div id="ai_dock_messages"></div>
            <div id="ai_dock_status"></div>
            <div id="ai_dock_actions">
                <button class="ai_dock_action" data-prompt="Explain the last command I ran">Explain command</button>
                <button class="ai_dock_action" data-prompt="What command should I use to">Suggest command</button>
                <button class="ai_dock_action" data-prompt="Help me fix this error:">Fix error</button>
                <button class="ai_dock_action" data-prompt="How do I">How to...</button>
            </div>
            <div id="ai_dock_input_area">
                <textarea id="ai_dock_input" placeholder="Ask anything... (Enter to send, Shift+Enter for new line)" rows="1"></textarea>
                <button id="ai_dock_send">SEND</button>
            </div>
        `;

        this.messagesEl = document.getElementById('ai_dock_messages');
        this.inputEl = document.getElementById('ai_dock_input');
        this.statusEl = document.getElementById('ai_dock_status');
        this.providerEl = document.getElementById('ai_dock_provider');
    }

    _bindEvents() {
        document.getElementById('ai_dock_send').addEventListener('click', () => this._sendMessage());
        
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendMessage();
            }
        });

        // Auto-resize textarea
        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 80) + 'px';
        });

        // Toggle button
        document.getElementById('ai_dock_toggle').addEventListener('click', () => {
            window.toggleBottomPanel('keyboard');
        });

        // Quick action buttons
        document.querySelectorAll('.ai_dock_action').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                this.inputEl.value = prompt + ' ';
                this.inputEl.focus();
            });
        });

        // F2 shortcut to toggle
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F2') {
                e.preventDefault();
                window.toggleBottomPanel();
            }
        });

        // Focus handling - don't steal focus from terminal
        this.inputEl.addEventListener('focus', () => {
            if (window.keyboard) window.keyboard.detach();
        });

        this.inputEl.addEventListener('blur', () => {
            if (window.keyboard) window.keyboard.attach();
        });
    }

    _updateProviderStatus(status) {
        if (this.providerEl) {
            this.providerEl.textContent = status;
        }
    }

    _setStatus(status, isLoading = false) {
        if (this.statusEl) {
            this.statusEl.textContent = status;
            this.statusEl.className = isLoading ? 'loading' : '';
        }
    }

    async _sendMessage() {
        const message = this.inputEl.value.trim();
        if (!message || this.isLoading) return;

        this._addMessage('user', message);
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';
        this.isLoading = true;
        this._setStatus('Thinking...', true);
        document.getElementById('ai_dock_send').disabled = true;

        try {
            const response = await this._callAI(message);
            this._addMessage('assistant', response);
            this._setStatus('');
        } catch (error) {
            this._addMessage('error', `Error: ${error.message}`);
            this._setStatus('Failed to get response');
        }

        this.isLoading = false;
        document.getElementById('ai_dock_send').disabled = false;
    }

    _addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai_dock_message ${role}`;
        
        const roleLabel = document.createElement('span');
        roleLabel.className = 'role';
        roleLabel.textContent = role === 'user' ? 'YOU' : role === 'assistant' ? 'AI' : 'SYSTEM';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';
        contentDiv.innerHTML = this._formatMessage(content);
        
        messageDiv.appendChild(roleLabel);
        messageDiv.appendChild(contentDiv);
        this.messagesEl.appendChild(messageDiv);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        
        this.chatHistory.push({ role, content });
    }

    _formatMessage(content) {
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code>${code.trim()}</code></pre>`;
        });
        
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    async _callAI(message) {
        if (!this.provider) {
            await this._detectProvider();
        }

        if (this.provider === 'duckduckgo') {
            return this._callDuckDuckGo(message);
        } else if (this.provider === 'phind') {
            return this._callPhind(message);
        } else if (this.provider === 'ollama') {
            return this._callOllama(message);
        } else if (this.provider === 'openrouter') {
            return this._callOpenRouter(message);
        } else {
            throw new Error('No AI provider available');
        }
    }

    async _callDuckDuckGo(message) {
        const https = require('https');
        
        if (!this.ddgVqd) {
            const available = await this._checkDuckDuckGo();
            if (!available) {
                throw new Error('DuckDuckGo AI is not available');
            }
        }

        const systemPrompt = 'You are a helpful AI assistant in eDEX-UI terminal. Be concise and technical.';
        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.chatHistory.filter(m => m.role !== 'error').slice(-10).map(m => ({
                role: m.role,
                content: m.content
            })),
            { role: 'user', content: message }
        ];

        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                model: this.ddgModel,
                messages: messages
            });

            const options = {
                hostname: 'duckduckgo.com',
                port: 443,
                path: '/duckchat/v1/chat',
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
                    'Accept': 'text/event-stream',
                    'Content-Type': 'application/json',
                    'Origin': 'https://duckduckgo.com',
                    'x-vqd-4': this.ddgVqd,
                    'Cache-Control': 'no-store'
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                let fullResponse = '';
                
                const newVqd = res.headers['x-vqd-4'];
                if (newVqd) this.ddgVqd = newVqd;

                res.on('data', (chunk) => {
                    responseData += chunk.toString();
                    const lines = responseData.split('\n');
                    responseData = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ') && line.length > 6) {
                            const jsonStr = line.substring(6);
                            if (jsonStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(jsonStr);
                                if (parsed.message) fullResponse += parsed.message;
                            } catch (e) {}
                        }
                    }
                });

                res.on('end', () => {
                    if (fullResponse) resolve(fullResponse);
                    else reject(new Error('No response from DuckDuckGo AI'));
                });
            });

            req.on('error', (e) => reject(new Error(`Request failed: ${e.message}`)));
            req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
            req.write(data);
            req.end();
        });
    }

    async _callPhind(message) {
        const https = require('https');

        const systemPrompt = 'You are a helpful AI assistant in eDEX-UI terminal. Be concise and technical.';
        const messageHistory = [
            { role: 'system', content: systemPrompt },
            ...this.chatHistory.filter(m => m.role !== 'error').slice(-10).map(m => ({
                role: m.role,
                content: m.content
            })),
            { role: 'user', content: message }
        ];

        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                additional_extension_context: '',
                allow_magic_buttons: true,
                is_vscode_extension: true,
                message_history: messageHistory,
                requested_model: 'Phind-70B',
                user_input: message
            });

            const options = {
                hostname: 'https.extension.phind.com',
                port: 443,
                path: '/agent/',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': '',
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity'
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                let fullResponse = '';

                res.on('data', (chunk) => {
                    responseData += chunk.toString();
                    const lines = responseData.split('\n');
                    responseData = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.substring(6);
                            try {
                                const parsed = JSON.parse(jsonStr);
                                if (parsed.choices && parsed.choices[0]?.delta?.content) {
                                    fullResponse += parsed.choices[0].delta.content;
                                }
                            } catch (e) {}
                        }
                    }
                });

                res.on('end', () => {
                    if (fullResponse) resolve(fullResponse);
                    else reject(new Error('No response from Phind AI'));
                });
            });

            req.on('error', (e) => reject(new Error(`Request failed: ${e.message}`)));
            req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
            req.write(data);
            req.end();
        });
    }

    async _callOllama(message) {
        const http = require('http');
        const url = require('url');
        const parsed = url.parse(this.ollamaHost);

        const messages = [
            { role: 'system', content: 'You are a helpful AI assistant in eDEX-UI terminal. Be concise and technical.' },
            ...this.chatHistory.filter(m => m.role !== 'error').slice(-10).map(m => ({
                role: m.role,
                content: m.content
            })),
            { role: 'user', content: message }
        ];

        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                model: this.ollamaModel,
                messages: messages,
                stream: false
            });

            const req = http.request({
                hostname: parsed.hostname,
                port: parsed.port || 11434,
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, (res) => {
                let responseData = '';
                res.on('data', (chunk) => responseData += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        if (result.error) reject(new Error(result.error));
                        else if (result.message?.content) resolve(result.message.content);
                        else reject(new Error('Invalid response format'));
                    } catch (e) {
                        reject(new Error('Failed to parse response'));
                    }
                });
            });

            req.on('error', (e) => reject(new Error(`Request failed: ${e.message}`)));
            req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
            req.write(data);
            req.end();
        });
    }

    async _callOpenRouter(message) {
        const https = require('https');
        const apiKey = process.env.OPENROUTER_API_KEY || (window.settings && window.settings.aiApiKey);
        
        if (!apiKey) throw new Error('No OpenRouter API key configured');

        const messages = [
            { role: 'system', content: 'You are a helpful AI assistant in eDEX-UI terminal. Be concise and technical.' },
            ...this.chatHistory.filter(m => m.role !== 'error').slice(-10).map(m => ({
                role: m.role,
                content: m.content
            })),
            { role: 'user', content: message }
        ];

        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                model: 'anthropic/claude-3.5-sonnet',
                messages: messages,
                max_tokens: 2048
            });

            const req = https.request({
                hostname: 'openrouter.ai',
                port: 443,
                path: '/api/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/qmndr/edex-ui',
                    'X-Title': 'eDEX-UI AI Dock'
                }
            }, (res) => {
                let responseData = '';
                res.on('data', (chunk) => responseData += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        if (result.error) reject(new Error(result.error.message || 'API error'));
                        else if (result.choices?.[0]) resolve(result.choices[0].message.content);
                        else reject(new Error('Invalid response format'));
                    } catch (e) {
                        reject(new Error('Failed to parse response'));
                    }
                });
            });

            req.on('error', (e) => reject(new Error(`Request failed: ${e.message}`)));
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
            req.write(data);
            req.end();
        });
    }

    show() {
        const dock = document.getElementById(this.containerId);
        if (dock) {
            dock.classList.remove('hidden');
            this.isVisible = true;
        }
    }

    hide() {
        const dock = document.getElementById(this.containerId);
        if (dock) {
            dock.classList.add('hidden');
            this.isVisible = false;
        }
    }
}

window.AIDock = AIDock;
