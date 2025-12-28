import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, MathIcon, CodeIcon, BrainIcon, CpuIcon, PaperclipIcon, XIcon, StopIcon, FengshuiIcon } from './Icons';
import { ReasoningMode } from '../types';

interface ChatInputProps {
  onSend: (message: string, attachments: { name: string; content: string }[]) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  currentMode: ReasoningMode;
  onModeChange: (mode: ReasoningMode) => void;
  modelId?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSend, onStop, isLoading, disabled, currentMode, onModeChange, modelId }) => {
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
      // Reset input value so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleSend = async () => {
    if ((input.trim() || selectedFiles.length > 0) && !isLoading && !disabled) {
      let attachments: { name: string; content: string }[] = [];
      
      if (selectedFiles.length > 0) {
        try {
          const filePromises = selectedFiles.map(async (file) => ({
            name: file.name,
            content: await readFileContent(file)
          }));
          attachments = await Promise.all(filePromises);
        } catch (error) {
          console.error("Failed to read files", error);
          alert("无法读取部分文件内容");
          return;
        }
      }

      onSend(input.trim(), attachments);
      
      setInput('');
      setSelectedFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const modes: { id: ReasoningMode; label: string; icon: React.FC<{className?: string}> }[] = [
    { id: 'general', label: '通用模式', icon: CpuIcon },
    { id: 'math', label: '数学证明', icon: MathIcon },
    { id: 'coding', label: '编程竞赛', icon: CodeIcon },
    { id: 'logic', label: '逻辑分析', icon: BrainIcon },
    { id: 'fengshui', label: '命理大师', icon: FengshuiIcon },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6">
      {/* Mode Selector */}
      <div className="flex gap-3 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center md:justify-start">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            disabled={isLoading || disabled}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap border shadow-sm
              ${currentMode === mode.id 
                ? 'bg-bronze-600 text-white border-bronze-700 shadow-bronze-600/20' 
                : 'bg-white text-ink-500 border-parchment-200 hover:bg-parchment-100 hover:text-ink-900'}
            `}
          >
            <mode.icon className="w-4 h-4" />
            {mode.label}
          </button>
        ))}
      </div>

      <div className={`
        relative flex flex-col w-full p-4 glass-panel rounded-3xl transition-all duration-300
        ${(input || selectedFiles.length > 0) ? 'border-bronze-500/30 shadow-lg shadow-bronze-900/5' : 'border-parchment-200'}
      `}>
        {/* File Preview Chips */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-parchment-100 border border-parchment-300 rounded-lg w-fit max-w-[200px]">
                <div className="p-1 bg-white rounded shrink-0 shadow-sm">
                  <PaperclipIcon className="w-4 h-4 text-bronze-600" />
                </div>
                <span className="text-sm text-ink-700 truncate">{file.name}</span>
                <button 
                  onClick={() => removeFile(index)}
                  className="p-0.5 hover:bg-bronze-100 rounded-full transition-colors text-ink-400 hover:text-ink-900 shrink-0"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          {/* File Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || disabled}
            className="p-3 mb-1 text-ink-400 hover:text-bronze-600 hover:bg-parchment-100 rounded-2xl transition-colors disabled:opacity-50"
            title="上传上下文文件 (支持多选)"
          >
            <PaperclipIcon className="w-6 h-6" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept=".txt,.md,.json,.csv,.py,.js,.ts,.tsx,.html,.css,.xml,.yaml,.yml,.ini,.conf,.log"
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "请先配置 OpenRouter API Key" : `输入你的问题 (${currentMode} 模式)...`}
            rows={1}
            disabled={isLoading || disabled}
            className="flex-1 bg-transparent text-ink-900 placeholder-ink-300 text-lg md:text-xl resize-none focus:outline-none max-h-[300px] py-4 scrollbar-hide font-serif leading-relaxed selection:bg-bronze-100"
          />
          
          <div className="mb-1">
            {isLoading ? (
              <button
                onClick={onStop}
                className="p-3 rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 transition-all duration-200 flex items-center justify-center border border-red-200"
                title="停止生成"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                   <StopIcon className="w-4 h-4" />
                </div>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!input.trim() && selectedFiles.length === 0) || disabled}
                className={`
                  p-3 rounded-2xl transition-all duration-200 flex items-center justify-center
                  ${(input.trim() || selectedFiles.length > 0) && !disabled
                    ? 'bg-bronze-600 text-white hover:bg-bronze-500 shadow-md shadow-bronze-600/20 scale-100' 
                    : 'bg-parchment-200 text-ink-300 cursor-not-allowed scale-95 opacity-50'}
                `}
              >
                <SendIcon className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex justify-between items-center mt-4 px-2">
        <div className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></span>
           <span className="text-xs text-ink-400 font-bold uppercase tracking-widest">OpenRouter System Online</span>
        </div>
        <p className="text-xs text-ink-400 font-mono">
          MODEL: {modelId ? modelId.toUpperCase() : 'DEEPSEEK V3.2 SPECIALE'} / {currentMode.toUpperCase()}
        </p>
      </div>
    </div>
  );
};

export default ChatInput;