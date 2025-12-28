import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, Role, ReasoningMode } from './types';
import { streamGeminiResponse } from './services/geminiService'; // Actually calls DeepSeek via OpenRouter
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import { BrainIcon, TrashIcon, CpuIcon, DownloadIcon, SettingsIcon, KeyIcon, RefreshIcon } from './components/Icons';

const DEFAULT_MODEL_ID = "deepseek/deepseek-v3.2-speciale";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ReasoningMode>('general');
  const [timerMs, setTimerMs] = useState(0);
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_api_key') || '');
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('openrouter_api_key'));
  
  // Model Parameters
  const [temperature, setTemperature] = useState<number>(0.6); // Default for reasoning models
  const [systemPrompt, setSystemPrompt] = useState<string>(''); // Custom System Prompt State
  
  // Default to 'deepseek/deepseek-v3.2-speciale' as requested
  const [modelId, setModelId] = useState<string>(localStorage.getItem('openrouter_model_id') || DEFAULT_MODEL_ID);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Timer logic
  useEffect(() => {
    if (isLoading) {
      setTimerMs(0);
      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setTimerMs(Date.now() - startTime);
      }, 50); // Update frequently for smooth timer
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isLoading]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const saveSettings = () => {
    const trimmedKey = apiKey.trim();
    const trimmedModelId = modelId.trim();
    localStorage.setItem('openrouter_api_key', trimmedKey);
    localStorage.setItem('openrouter_model_id', trimmedModelId);
    setApiKey(trimmedKey);
    setModelId(trimmedModelId);
    setShowSettings(false);
  };

  const resetModelId = () => {
    setModelId(DEFAULT_MODEL_ID);
  };

  const handleClearChat = () => {
    if (window.confirm("确认清空对话?")) {
      setMessages([]);
      setTimerMs(0);
    }
  };

  const handleDeleteMessage = useCallback((id: string) => {
    if (window.confirm("确认删除此条消息?")) {
      setMessages(prev => prev.filter(msg => msg.id !== id));
    }
  }, []);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      // Mark the last message as not streaming
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === Role.MODEL && lastMsg.isStreaming) {
           return prev.map(msg => msg.id === lastMsg.id ? { ...msg, isStreaming: false, text: msg.text + " [已终止]" } : msg);
        }
        return prev;
      });
    }
  }, []);

  const handleExportChat = () => {
    if (messages.length === 0) return;

    const exportText = messages.map(msg => {
      const role = msg.role === Role.USER ? "User" : "DeepSeek Speciale";
      const time = new Date(msg.timestamp).toLocaleString('zh-CN');
      let content = `### ${role} [${time}]\n`;
      if (msg.usage) {
        content += `> Token Usage: Total ${msg.usage.total_tokens} (Prompt ${msg.usage.prompt_tokens}, Completion ${msg.usage.completion_tokens})\n`;
      }
      if (msg.reasoning) {
        content += `> **深度思考过程**:\n${msg.reasoning.replace(/\n/g, '\n> ')}\n\n`;
      }
      content += `${msg.text}\n\n---\n\n`;
      return content;
    }).join('');

    const blob = new Blob([exportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepseek-speciale-chat-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to trigger API after updating state
  const triggerApiCall = async (currentMessageText: string, history: Message[]) => {
     if (!apiKey) {
      setShowSettings(true);
      return;
    }

    setIsLoading(true);
    startTimeRef.current = Date.now();

    // Add Placeholder AI Message
    const aiMessageId = uuidv4();
    const initialAiMessage: Message = {
      id: aiMessageId,
      role: Role.MODEL,
      text: '', // Start empty
      reasoning: '', // Start empty
      isStreaming: true,
      timestamp: Date.now(),
      mode: mode,
      thinkingTime: 0
    };

    setMessages(prev => [...prev, initialAiMessage]);

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    try {
      let fullText = '';
      let fullReasoning = '';
      let firstTokenReceived = false;
      
      await streamGeminiResponse(
        currentMessageText,
        history, 
        mode,
        (chunkText, chunkReasoning, usage) => {
          
          if (!firstTokenReceived && (chunkText || chunkReasoning)) {
             const thinkingTime = Date.now() - startTimeRef.current;
             setMessages(prev => prev.map(msg => 
               msg.id === aiMessageId 
                 ? { ...msg, thinkingTime } 
                 : msg
             ));
             firstTokenReceived = true;
          }

          if (chunkReasoning) fullReasoning += chunkReasoning;
          if (chunkText) fullText += chunkText;

          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, text: fullText, reasoning: fullReasoning, ...(usage ? { usage } : {}) } 
              : msg
          ));
        },
        apiKey,
        modelId, // Pass the configured model ID
        temperature, 
        systemPrompt, 
        abortControllerRef.current.signal
      );

      // Finalize
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, isStreaming: false } 
          : msg
      ));

    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error("Error in chat:", error);
        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, text: `Error: ${error.message || "Connection interrupted."}`, isStreaming: false } 
            : msg
        ));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = useCallback(async (text: string, attachments: { name: string, content: string }[] = []) => {
    let messageText = text;
    if (attachments.length > 0) {
      const filesContent = attachments.map(f => `[文件上下文: ${f.name}]\n${f.content}\n[文件结束]`).join('\n\n');
      messageText = `${filesContent}\n\n${text || '请分析上述文件内容。'}`;
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: Role.USER,
      text: messageText,
      timestamp: Date.now(),
      mode: mode
    };

    setMessages(prev => {
      const newHistory = [...prev, userMessage];
      // Trigger API with current history (excluding the new user msg for history param, pass it as current)
      // Note: triggerApiCall expects history NOT including the current message
      triggerApiCall(messageText, prev); 
      return newHistory;
    });
  }, [mode, apiKey, temperature, systemPrompt, modelId]);

  const handleEditMessage = useCallback(async (id: string, newText: string) => {
    setMessages(prev => {
      const index = prev.findIndex(msg => msg.id === id);
      if (index === -1) return prev;

      // Keep messages BEFORE the edited message
      const history = prev.slice(0, index);
      
      // Create updated User Message
      const updatedUserMessage: Message = {
        ...prev[index],
        text: newText,
        timestamp: Date.now() // Update timestamp to now? Or keep original? Usually update.
      };

      // Trigger Generation
      triggerApiCall(newText, history);

      return [...history, updatedUserMessage];
    });
  }, [mode, apiKey, temperature, systemPrompt, modelId]);

  const handleRetryMessage = useCallback(async (id: string) => {
    setMessages(prev => {
      const index = prev.findIndex(msg => msg.id === id);
      if (index === -1) return prev;
      
      // We assume the message at `index` is a Bot message we want to retry.
      // We need the user message that came BEFORE it.
      const userMsgIndex = index - 1;
      
      if (userMsgIndex < 0 || prev[userMsgIndex].role !== Role.USER) {
        console.error("Cannot retry: No preceding user message found.");
        return prev;
      }

      // Keep history up to (and including) the user message
      const historyIncludingUser = prev.slice(0, userMsgIndex + 1);
      const userMsg = prev[userMsgIndex];
      const historyContext = prev.slice(0, userMsgIndex); // Context excludes current prompt

      // Trigger API
      triggerApiCall(userMsg.text, historyContext);

      // Return history removing the old bot response (it will be re-added by triggerApiCall)
      return historyIncludingUser;
    });
  }, [mode, apiKey, temperature, systemPrompt, modelId]);

  return (
    <div className="flex flex-col h-screen bg-parchment-50 text-ink-900 font-sans selection:bg-bronze-100 selection:text-ink-900 relative">
      
      {/* Background Decor - Subtle Warm Light */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-parchment-100 to-transparent opacity-60"></div>
         <div className="absolute top-20 right-20 w-[600px] h-[600px] bg-bronze-100/30 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-20 left-20 w-[500px] h-[500px] bg-parchment-200/40 rounded-full blur-[80px]"></div>
      </div>

      {/* Settings Modal (API Key & Parameters) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white border border-parchment-200 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-bronze-50 rounded-2xl border border-bronze-100">
                <SettingsIcon className="w-8 h-8 text-bronze-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-ink-900 font-serif">配置中心</h3>
                <p className="text-ink-500 text-sm mt-1">DeepSeek V3.2 Speciale 参数设置</p>
              </div>
            </div>
            
            <div className="space-y-8">
              {/* API Key Section */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-ink-900 tracking-wide uppercase flex items-center gap-2">
                  <KeyIcon className="w-4 h-4 text-bronze-600" />
                  OpenRouter API Key
                </label>
                <div className="relative">
                  <input 
                    type="password" 
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full bg-parchment-50 border border-parchment-300 rounded-xl px-4 py-3 text-ink-900 focus:outline-none focus:border-bronze-500 focus:ring-1 focus:ring-bronze-500 transition-all font-mono"
                  />
                </div>
                <p className="text-xs text-ink-500 flex justify-between px-1">
                  <span>密钥仅存储在本地浏览器。</span>
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-bronze-600 hover:text-bronze-500 underline">获取 Key &rarr;</a>
                </p>
              </div>

              {/* Model Parameters Board */}
              <div className="space-y-4 p-5 bg-parchment-100/50 rounded-2xl border border-parchment-200">
                <div className="flex items-center justify-between">
                   <h4 className="font-bold text-ink-900 text-sm uppercase tracking-wide flex items-center gap-2">
                     <CpuIcon className="w-4 h-4 text-bronze-600" />
                     模型参数设置
                   </h4>
                   <button 
                     onClick={resetModelId}
                     className="text-xs text-bronze-600 hover:text-bronze-800 underline flex items-center gap-1"
                     title="重置为默认模型"
                   >
                     <RefreshIcon className="w-3 h-3" /> 重置默认
                   </button>
                </div>

                {/* Model ID Input */}
                <div>
                   <label className="block text-sm font-bold text-ink-700 mb-2">模型 ID (Model ID)</label>
                   <input 
                     type="text" 
                     value={modelId}
                     onChange={(e) => setModelId(e.target.value)}
                     placeholder={DEFAULT_MODEL_ID}
                     className="w-full bg-parchment-50 border border-parchment-300 rounded-lg px-3 py-2 text-ink-900 font-mono text-sm focus:outline-none focus:border-bronze-500 transition-all"
                   />
                   <p className="text-[10px] text-ink-400 mt-1">
                     默认: <code className="bg-parchment-200 px-1 rounded text-bronze-700">{DEFAULT_MODEL_ID}</code>
                   </p>
                </div>
                
                {/* System Prompt Input */}
                <div className="pt-2">
                  <label className="block text-sm font-bold text-ink-700 mb-2">系统提示词 (System Prompt)</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="例如：你是一个经验丰富的Python架构师，回答要简洁明了..."
                    className="w-full h-24 bg-parchment-50 border border-parchment-300 rounded-lg px-3 py-2 text-ink-900 text-sm resize-none focus:outline-none focus:border-bronze-500 transition-all placeholder:text-ink-300"
                  />
                  <p className="text-[10px] text-ink-400 mt-1">设置后将覆盖默认的模型角色设定。</p>
                </div>

                {/* Temperature Slider */}
                <div className="pt-2">
                   <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium text-ink-700">随机性 (Temperature)</label>
                      <span className="text-sm font-mono font-bold text-bronze-700">{temperature}</span>
                   </div>
                   <input 
                      type="range" 
                      min="0" 
                      max="1.5" 
                      step="0.1" 
                      value={temperature} 
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full h-2 bg-parchment-300 rounded-lg appearance-none cursor-pointer accent-bronze-600 hover:accent-bronze-500"
                   />
                   <div className="flex justify-between text-[10px] text-ink-400 mt-1 font-mono">
                      <span>0.0 (严谨/代码)</span>
                      <span>1.5 (创意/脑暴)</span>
                   </div>
                </div>

                <div className="pt-2 border-t border-parchment-200">
                   <p className="text-xs text-ink-500 leading-relaxed">
                     <strong className="text-ink-700">配置说明：</strong> 若遇到 "Provider returned error"，请检查 Model ID 是否正确。推荐使用 DeepSeek R1 以获得完整的推理思考过程。
                   </p>
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                 <button 
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-white border border-parchment-300 hover:bg-parchment-50 text-ink-700 font-bold py-3 rounded-xl transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={saveSettings}
                  className="flex-1 bg-bronze-600 hover:bg-bronze-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg hover:shadow-bronze-600/20"
                >
                  保存设置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none h-20 border-b border-parchment-200 bg-parchment-50/90 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo Section */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-bronze-600 flex items-center justify-center shadow-lg shadow-bronze-600/20 relative overflow-hidden group">
                <div className="absolute inset-0 bg-white/10 animate-pulse-fast"></div>
                <BrainIcon className="w-6 h-6 text-white relative z-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-ink-900 tracking-tight leading-none font-serif flex items-center gap-3">
                  DeepSeek <span className="text-xs bg-parchment-200 text-ink-700 px-2 py-0.5 rounded border border-parchment-300 font-sans tracking-widest">SPECIALE</span>
                </h1>
              </div>
            </div>
          </div>

          {/* Center Timer */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
             {isLoading && (
               <div className="flex items-center gap-3 px-5 py-2 rounded-full bg-white border border-bronze-200 shadow-sm">
                 <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bronze-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-bronze-500"></span>
                  </span>
                 <span className="text-ink-900 text-xl font-mono font-bold tracking-wider min-w-[80px]">
                   {(timerMs / 1000).toFixed(2)}s
                 </span>
               </div>
             )}
          </div>

          <div className="flex items-center gap-3">
             {/* Action Buttons */}
             <button 
               onClick={handleExportChat}
               disabled={messages.length === 0}
               className="p-3 text-ink-500 hover:text-bronze-600 hover:bg-parchment-100 rounded-xl transition-colors"
               title="导出对话"
             >
               <DownloadIcon className="w-6 h-6" />
             </button>
             
             <button 
               onClick={() => setShowSettings(true)}
               className="p-3 text-ink-500 hover:text-bronze-600 hover:bg-parchment-100 rounded-xl transition-colors"
               title="OpenRouter 设置"
             >
               <SettingsIcon className="w-6 h-6" />
             </button>

             <div className="h-8 w-px bg-parchment-300 hidden md:block mx-1"></div>
             
             <button 
               onClick={handleClearChat}
               disabled={messages.length === 0 || isLoading}
               className="p-3 text-ink-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-30"
             >
               <TrashIcon className="w-6 h-6" />
             </button>
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 scroll-smooth relative z-[1]">
        <div className="max-w-5xl mx-auto flex flex-col min-h-full">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-ink-300 mt-10">
               <div className="w-24 h-24 mb-6 rounded-3xl bg-parchment-100 flex items-center justify-center">
                 <BrainIcon className="w-12 h-12 text-parchment-300" />
               </div>
               <h2 className="text-3xl font-serif text-ink-900 mb-2 font-bold">DeepSeek V3.2 Speciale</h2>
               <p className="text-lg text-ink-500">等待输入指令...</p>
            </div>
          ) : (
            <div className="flex-1 pb-4">
              {messages.map((msg) => (
                <ChatMessage 
                  key={msg.id} 
                  message={msg} 
                  onDelete={handleDeleteMessage}
                  onEdit={handleEditMessage}
                  onRetry={handleRetryMessage}
                  isLoading={isLoading}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="flex-none z-10 bg-gradient-to-t from-parchment-50 via-parchment-50 to-transparent pt-4">
        <ChatInput 
          onSend={handleSendMessage} 
          onStop={handleStopGeneration}
          isLoading={isLoading} 
          disabled={!apiKey}
          currentMode={mode}
          onModeChange={setMode}
          modelId={modelId}
        />
      </footer>
    </div>
  );
}

export default App;