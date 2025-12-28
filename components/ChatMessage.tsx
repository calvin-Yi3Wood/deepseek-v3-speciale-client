import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Role } from '../types';
import { UserIcon, BotIcon, BrainIcon, TrashIcon, CopyIcon, EditIcon, RefreshIcon } from './Icons';

interface ChatMessageProps {
  message: Message;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
  onRetry?: (id: string) => void;
  isLoading?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onDelete, onEdit, onRetry, isLoading }) => {
  const isUser = message.role === Role.USER;
  const [isReasoningCollapsed, setIsReasoningCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);

  useEffect(() => {
    setEditText(message.text);
  }, [message.text]);

  const handleCopy = () => {
    const textToCopy = message.reasoning 
      ? `【深度推理过程】\n${message.reasoning}\n\n【回答】\n${message.text}`
      : message.text;
      
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveEdit = () => {
    if (editText.trim() !== message.text && onEdit) {
      onEdit(message.id, editText);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(message.text);
    setIsEditing(false);
  };

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-8 animate-fadeIn group relative`}>
      <div className={`flex max-w-[98%] md:max-w-[90%] gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border
          ${isUser 
            ? 'bg-ink-900 border-ink-900 shadow-md' 
            : 'bg-parchment-100 border-parchment-200'
          }
        `}>
          {isUser ? <UserIcon className="w-5 h-5 text-parchment-50" /> : <BotIcon className="w-6 h-6 text-bronze-600" />}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} flex-1 min-w-0 relative group/content`}>
          <div className="flex items-center gap-2 mb-1.5 opacity-80 w-full relative">
            <span className={`text-xs font-bold tracking-widest ${isUser ? 'text-ink-700' : 'text-bronze-600'}`}>
              {isUser ? 'USER' : 'DEEPSEEK V3.2'}
            </span>
            <span className="text-xs text-ink-400 font-mono">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            {!isUser && message.mode && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-bronze-100 text-bronze-700 font-mono uppercase border border-bronze-200">
                {message.mode}
              </span>
            )}
            {!isUser && message.thinkingTime && (
               <span className="text-xs text-ink-500 font-mono flex items-center gap-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-bronze-500"></span>
                 {(message.thinkingTime / 1000).toFixed(2)}s
               </span>
            )}
            {!isUser && message.usage && (
               <span className="text-[10px] text-ink-400 font-mono hidden md:inline-flex items-center ml-2 opacity-60">
                 {message.usage.total_tokens} T
               </span>
            )}
            
            {/* Action Buttons (Always Visible) */}
            <div className={`
              absolute top-0 flex items-center gap-1
              ${isUser ? '-left-28' : '-right-28'}
            `}>
               <button 
                onClick={handleCopy}
                className="p-1.5 hover:bg-parchment-200 rounded text-ink-300 hover:text-bronze-600 transition-colors"
                title="复制内容"
              >
                {copied ? <span className="text-xs text-green-600 font-bold px-0.5">OK</span> : <CopyIcon className="w-4 h-4" />}
              </button>

              {/* Edit Button (User Only) */}
              {isUser && !isEditing && onEdit && !isLoading && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 hover:bg-parchment-200 rounded text-ink-300 hover:text-bronze-600 transition-colors"
                  title="编辑提示词"
                >
                  <EditIcon className="w-4 h-4" />
                </button>
              )}

              {/* Retry Button (Bot Only) */}
              {!isUser && onRetry && !isLoading && !message.isStreaming && (
                <button 
                  onClick={() => onRetry(message.id)}
                  className="p-1.5 hover:bg-parchment-200 rounded text-ink-300 hover:text-bronze-600 transition-colors"
                  title="重新生成"
                >
                  <RefreshIcon className="w-4 h-4" />
                </button>
              )}

              {onDelete && !isEditing && (
                <button 
                  onClick={() => onDelete(message.id)}
                  className="p-1.5 hover:bg-red-50 rounded text-ink-300 hover:text-red-500 transition-colors"
                  title="删除消息"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          <div className={`
            relative px-6 py-5 rounded-2xl text-lg leading-8 shadow-sm w-full border
            ${isUser 
              ? 'bg-bronze-600 text-parchment-50 rounded-tr-none border-bronze-700 shadow-bronze-900/10' 
              : 'bg-white text-ink-900 rounded-tl-none border-parchment-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
            }
          `}>
             
            {/* Edit Mode Input */}
            {isEditing ? (
              <div className="flex flex-col gap-3 w-full">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-white text-ink-900 p-3 rounded-xl border border-bronze-300 focus:outline-none focus:ring-2 focus:ring-bronze-400/50 resize-none font-serif text-base shadow-inner"
                  rows={Math.max(3, editText.split('\n').length)}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                   <button 
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 text-sm text-parchment-100 bg-bronze-700/30 hover:bg-bronze-700/50 rounded-lg transition-colors border border-transparent"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleSaveEdit}
                    disabled={!editText.trim()}
                    className="px-3 py-1.5 text-sm bg-parchment-50 text-bronze-700 font-bold rounded-lg shadow-sm hover:bg-white transition-all disabled:opacity-50"
                  >
                    保存并重新生成
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Reasoning Block - Show during streaming OR when both reasoning and text exist */}
                {!isUser && ((message.isStreaming && !message.text) || (message.reasoning && message.text)) && (
                  <div className="mb-6 text-sm">
                    <button 
                      onClick={() => setIsReasoningCollapsed(!isReasoningCollapsed)}
                      className="flex items-center gap-2 text-bronze-700 hover:text-bronze-900 transition-colors mb-3 w-full text-left bg-bronze-50 border border-bronze-200 p-2.5 rounded-lg shadow-sm"
                    >
                      <BrainIcon className={`w-5 h-5 ${message.isStreaming && !message.text ? 'animate-pulse text-bronze-500' : 'text-bronze-600'}`} />
                      <span className="uppercase tracking-wider text-xs font-bold text-bronze-800">
                        {message.isStreaming && !message.text ? '深度思考中 (Reasoning...)' : '思维链 (Chain of Thought)'}
                      </span>
                      {message.reasoning && (
                        <span className="ml-auto text-bronze-500 text-[10px] font-mono border border-bronze-200 px-1.5 py-0.5 rounded">
                          {isReasoningCollapsed ? '展开 + ' : '收起 -'}
                        </span>
                      )}
                    </button>
                    
                    {(!isReasoningCollapsed || (message.isStreaming && !message.text)) && (
                      <div className="p-4 rounded-lg bg-parchment-100 text-ink-700 whitespace-pre-wrap leading-relaxed reasoning-block shadow-inner max-h-[600px] overflow-y-auto scrollbar-thin text-base font-serif border-t-2 border-bronze-500/20">
                        {message.reasoning || <span className="animate-pulse text-bronze-500 italic">正在进行逻辑推演...</span>}
                        {message.isStreaming && !message.text && message.reasoning && (
                          <span className="inline-block w-1.5 h-3 ml-1 align-middle bg-bronze-500 animate-pulse" />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Final Answer - Show text, or reasoning as answer when text is empty */}
                {(message.text || (!message.isStreaming && message.reasoning)) && (
                  // Removed prose-invert for standard light mode prose
                  <div className={`markdown-body prose prose-lg max-w-none
                    prose-p:text-inherit prose-headings:text-inherit prose-strong:text-inherit
                    prose-pre:bg-ink-900 prose-pre:border prose-pre:border-ink-700 prose-pre:rounded-xl prose-pre:text-parchment-50
                    prose-code:text-bronze-800 prose-code:bg-parchment-200/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                    prose-a:underline hover:prose-a:text-bronze-200
                    prose-blockquote:border-bronze-500 prose-blockquote:bg-parchment-100/50 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r prose-blockquote:italic
                    prose-li:marker:text-bronze-500
                    ${isUser ? 'prose-invert prose-p:text-parchment-50 prose-headings:text-parchment-50 prose-strong:text-white prose-code:text-parchment-100 prose-code:bg-white/10 prose-a:text-parchment-200' : ''}
                  `}>
                    <ReactMarkdown>{message.text || message.reasoning}</ReactMarkdown>
                  </div>
                )}
                
                {/* Blinking Cursor for Streaming text */}
                {message.isStreaming && message.text && (
                  <span className={`inline-block w-2.5 h-5 ml-1 align-middle animate-pulse ${isUser ? 'bg-parchment-50' : 'bg-bronze-500'}`} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatMessage);