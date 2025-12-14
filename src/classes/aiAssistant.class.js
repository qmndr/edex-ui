class AIAssistant {
    constructor(parentId) {
        this.parentId = parentId;
        this.isOpen = false;
        this.activeTab = 'guide';
        this.chatHistory = [];
        this.isLoading = false;
        
        this._createOverlay();
        this._bindEvents();
    }

    _createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'ai_assistant_overlay';
        overlay.innerHTML = `
            <div id="ai_assistant_container">
                <div id="ai_assistant_header">
                    <h2>AI ASSISTANT</h2>
                    <div id="ai_assistant_tabs">
                        <button class="ai_tab active" data-tab="guide">GUIDE</button>
                        <button class="ai_tab" data-tab="chat">AI CHAT</button>
                        <button class="ai_tab" data-tab="shortcuts">SHORTCUTS</button>
                    </div>
                    <button id="ai_assistant_close">X</button>
                </div>
                <div id="ai_assistant_content">
                    <div id="ai_guide_content" class="ai_content_panel active">
                        <div class="guide_section">
                            <h3>Welcome to eDEX-UI</h3>
                            <p>eDEX-UI is a fullscreen, cross-platform terminal emulator and system monitor inspired by sci-fi interfaces.</p>
                        </div>
                        <div class="guide_section">
                            <h3>Terminal</h3>
                            <p>The main terminal supports multiple tabs (click on EMPTY tabs to create new sessions). Use standard shell commands and enjoy full color support.</p>
                        </div>
                        <div class="guide_section">
                            <h3>System Panels</h3>
                            <p><strong>Left Panel:</strong> CPU usage, RAM monitoring, system info, and top processes.</p>
                            <p><strong>Right Panel:</strong> Network statistics, connection info, and the interactive globe showing your location.</p>
                        </div>
                        <div class="guide_section">
                            <h3>File Browser</h3>
                            <p>The file browser follows your terminal's current directory. Click files to insert their path into the terminal.</p>
                        </div>
                        <div class="guide_section">
                            <h3>Themes</h3>
                            <p>Press F12 or use the settings to change themes. Available themes include: tron, matrix, cyberpunk, synthwave, neon-noir, and more.</p>
                        </div>
                        <div class="guide_section">
                            <h3>AI Chat</h3>
                            <p>Switch to the AI Chat tab to ask questions, get coding help, or generate commands. Requires an API key configured in settings.</p>
                        </div>
                    </div>
                    <div id="ai_chat_content" class="ai_content_panel">
                        <div id="ai_chat_messages"></div>
                        <div id="ai_chat_input_container">
                            <textarea id="ai_chat_input" placeholder="Ask me anything... (Press Enter to send, Shift+Enter for new line)"></textarea>
                            <button id="ai_chat_send">SEND</button>
                        </div>
                        <div id="ai_chat_status"></div>
                    </div>
                    <div id="ai_shortcuts_content" class="ai_content_panel">
                        <div class="shortcut_group">
                            <h3>General</h3>
                            <div class="shortcut_item"><span class="key">F1</span> Open AI Assistant</div>
                            <div class="shortcut_item"><span class="key">F11</span> Toggle Fullscreen</div>
                            <div class="shortcut_item"><span class="key">F12</span> Open Settings</div>
                            <div class="shortcut_item"><span class="key">Escape</span> Close Overlays</div>
                        </div>
                        <div class="shortcut_group">
                            <h3>Terminal</h3>
                            <div class="shortcut_item"><span class="key">Ctrl+Shift+C</span> Copy Selection</div>
                            <div class="shortcut_item"><span class="key">Ctrl+Shift+V</span> Paste</div>
                            <div class="shortcut_item"><span class="key">Ctrl+Tab</span> Next Terminal Tab</div>
                            <div class="shortcut_item"><span class="key">Ctrl+Shift+Tab</span> Previous Terminal Tab</div>
                        </div>
                        <div class="shortcut_group">
                            <h3>Navigation</h3>
                            <div class="shortcut_item"><span class="key">Ctrl+L</span> Clear Terminal</div>
                            <div class="shortcut_item"><span class="key">Ctrl+D</span> Close Terminal Tab</div>
                            <div class="shortcut_item"><span class="key">Ctrl+F</span> Fuzzy Finder</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.container = document.getElementById('ai_assistant_container');
        this.chatMessages = document.getElementById('ai_chat_messages');
        this.chatInput = document.getElementById('ai_chat_input');
        this.chatStatus = document.getElementById('ai_chat_status');
    }

    _bindEvents() {
        document.getElementById('ai_assistant_close').addEventListener('click', () => this.close());
        
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        document.querySelectorAll('.ai_tab').forEach(tab => {
            tab.addEventListener('click', (e) => this._switchTab(e.target.dataset.tab));
        });

        document.getElementById('ai_chat_send').addEventListener('click', () => this._sendMessage());
        
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendMessage();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'F1') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    _switchTab(tabName) {
        this.activeTab = tabName;
        
        document.querySelectorAll('.ai_tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.ai_content_panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        document.getElementById(`ai_${tabName}_content`).classList.add('active');
        
        if (tabName === 'chat') {
            this.chatInput.focus();
        }
    }

    async _sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isLoading) return;

        this._addMessage('user', message);
        this.chatInput.value = '';
        this.isLoading = true;
        this._setStatus('Thinking...');

        try {
            const response = await this._callAI(message);
            this._addMessage('assistant', response);
            this._setStatus('');
        } catch (error) {
            this._addMessage('error', `Error: ${error.message}`);
            this._setStatus('Failed to get response');
        }

        this.isLoading = false;
    }

    _addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai_message ai_message_${role}`;
        
        const roleLabel = document.createElement('span');
        roleLabel.className = 'ai_message_role';
        roleLabel.textContent = role === 'user' ? 'YOU' : role === 'assistant' ? 'AI' : 'SYSTEM';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'ai_message_content';
        contentDiv.innerHTML = this._formatMessage(content);
        
        messageDiv.appendChild(roleLabel);
        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        this.chatHistory.push({ role, content });
    }

    _formatMessage(content) {
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre class="ai_code_block"><code>${code.trim()}</code></pre>`;
        });
        
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="ai_inline_code">$1</code>');
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    _setStatus(status) {
        this.chatStatus.textContent = status;
    }

    async _callAI(message) {
        const https = require('https');
        
        const apiKey = process.env.OPENROUTER_API_KEY || window.settings.aiApiKey;
        
        if (!apiKey) {
            throw new Error('No API key configured. Set OPENROUTER_API_KEY environment variable or aiApiKey in settings.');
        }

        const messages = [
            {
                role: 'system',
                content: 'You are a helpful AI assistant integrated into eDEX-UI, a sci-fi terminal emulator. Help users with terminal commands, coding questions, system administration, and general queries. Keep responses concise and technical when appropriate. Format code blocks with triple backticks.'
            },
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

            const options = {
                hostname: 'openrouter.ai',
                port: 443,
                path: '/api/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/qmndr/edex-ui',
                    'X-Title': 'eDEX-UI AI Assistant'
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        if (parsed.error) {
                            reject(new Error(parsed.error.message || 'API error'));
                        } else if (parsed.choices && parsed.choices[0]) {
                            resolve(parsed.choices[0].message.content);
                        } else {
                            reject(new Error('Invalid response format'));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse response'));
                    }
                });
            });

            req.on('error', (e) => {
                reject(new Error(`Request failed: ${e.message}`));
            });

            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(data);
            req.end();
        });
    }

    open() {
        this.isOpen = true;
        this.overlay.classList.add('visible');
        window.audioManager.panels.play();
        
        if (this.activeTab === 'chat') {
            setTimeout(() => this.chatInput.focus(), 100);
        }
    }

    close() {
        this.isOpen = false;
        this.overlay.classList.remove('visible');
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
}

module.exports = { AIAssistant };
