import { Message, Role, ReasoningMode } from '../types';

export const streamGeminiResponse = async (
  currentMessage: string,
  history: Message[],
  mode: ReasoningMode,
  onChunk: (text: string, reasoning: string | null, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void,
  apiKey: string,
  modelId: string = "deepseek/deepseek-v3.2-speciale",
  temperature: number = 0.6,
  customSystemPrompt: string = '', 
  signal?: AbortSignal
): Promise<void> => {
  if (!apiKey || apiKey.length < 5) {
    throw new Error("API Key 无效。请在设置中配置正确的 OpenRouter API Key。");
  }

  // OpenRouter API Endpoint
  const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
  
  let systemPrompt = "";

  if (customSystemPrompt.trim()) {
    systemPrompt = customSystemPrompt;
  } else {
    // Default system prompt - optimized for better responses
    const basePrompt = `你是 DeepSeek V3.2 Speciale，一个具有深度推理能力的高级AI助手。

核心要求：
1. 所有回答必须使用简体中文
2. 先进行深度思考和推理，再给出最终答案
3. 回答要准确、有条理、易于理解
4. 对于复杂问题，分步骤解释你的推理过程`;

    switch (mode) {
      case 'math':
        systemPrompt = `${basePrompt}

当前模式：数学证明专家
- 提供严谨的数学证明和推导
- 使用标准LaTeX格式展示公式
- 逐步展示推理过程，确保逻辑完整`;
        break;
      case 'coding':
        systemPrompt = `${basePrompt}

当前模式：编程竞赛专家
- 提供高效、正确的代码解决方案
- 代码要有清晰的注释
- 分析时间和空间复杂度
- 考虑边界情况和异常处理`;
        break;
      case 'logic':
        systemPrompt = `${basePrompt}

当前模式：逻辑分析专家
- 提供严密的逻辑分析
- 识别论证中的假设和推理链
- 指出可能的逻辑漏洞或谬误`;
        break;
      case 'fengshui':
        systemPrompt = `你是一位精通中国传统命理术数的大师，拥有数十年的命理研究与实践经验，博采众家之长。

核心身份：
- 精通子平八字（四柱命理），深研《渊海子平》《三命通会》《滴天髓》《穷通宝鉴》
- 精通紫微斗数，熟稔《紫微斗数全书》，擅长星曜组合与宫位分析
- 精通奇门遁甲，掌握时家奇门排盘与格局判断
- 精通大六壬，善用天地盘、三传四课推演吉凶
- 精通六爻纳甲，熟练运用《增删卜易》《卜筮正宗》断卦技法

专业能力：
1. 【八字命理】：分析日主强弱、十神配置、格局高低、大运流年、婚姻财运事业
2. 【紫微斗数】：排命盘、看星曜组合、分析十二宫位、推断人生轨迹
3. 【奇门遁甲】：择时决策、预测吉凶、分析出行求财婚姻诉讼
4. 【大六壬】：占事问卜、推断事情发展走向与结果
5. 【六爻占卜】：起卦断卦、分析世应、判断动爻变爻
6. 【择日择吉】：婚嫁、搬迁、开业等重要事项的吉日选择

回答规范：
- 用户提供生辰八字时，先排出四柱（年柱、月柱、日柱、时柱），再进行分析
- 排盘时说明节气交接等关键信息
- 分析要有理有据，引用经典口诀或理论支撑
- 对于模糊信息要主动询问（如出生时辰、阴历阳历、真太阳时等）
- 预测结果客观呈现，吉凶皆言，不一味迎合
- 给出趋吉避凶的实用建议

免责声明：命理术数属于中国传统文化和民俗学范畴，分析仅供参考娱乐，不构成任何决策依据。人生命运掌握在自己手中，请理性看待。`;
        break;
      default:
        systemPrompt = `${basePrompt}

当前模式：通用助手
- 根据问题类型灵活调整回答风格
- 简单问题简洁回答，复杂问题详细解释`;
        break;
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => {
      const m: any = {
        role: msg.role === Role.USER ? 'user' : 'assistant',
        content: msg.text
      };
      // Only attach reasoning if it exists and is not empty to avoid API validation errors
      if (msg.role === Role.MODEL && msg.reasoning) {
         // OpenRouter does not standardize 'reasoning_details' in input yet. 
         // Safest is to append to content or omit. 
         // For now, we omit it in input to prevent 400 errors, unless specifically needed.
         // If we must preserve it, we can append it to content.
         // m.content = `${msg.reasoning}\n\n${msg.text}`;
      }
      return m;
    }),
    { role: 'user', content: currentMessage }
  ];

  const safeApiKey = apiKey.trim();

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${safeApiKey}`,
        // 'HTTP-Referer': window.location.href, // Removed to prevent "No cookie auth credentials" error in restricted envs
        // 'X-Title': 'DeepSeek Client',         // Removed to prevent "No cookie auth credentials" error in restricted envs
      },
      credentials: 'omit', // Critical for preventing auth errors in some envs
      mode: 'cors',
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        stream: true,
        temperature: temperature,
        max_tokens: 16384,  // Reduced to improve connection stability
        include_reasoning: true,
      }),
      signal: signal
    });

    if (!response.ok) {
      let errorMsg = `API request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error?.message || errorMsg;
      } catch (e) {
        errorMsg = await response.text() || errorMsg;
      }
      throw new Error(errorMsg);
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';
    
    // State for parsing <think> tags in content (fallback for models that don't use 'reasoning' field)
    let isThinkingInContent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) processBuffer(buffer);
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last partial line in the buffer

      for (const line of lines) {
        processBuffer(line);
      }
    }

    function processBuffer(line: string) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) return;
      
      const dataStr = trimmed.slice(6); // Remove "data: " prefix
      if (dataStr === '[DONE]') return;

      try {
        const data = JSON.parse(dataStr);
        
        if (data.usage) {
           onChunk('', null, data.usage);
        }

        const delta = data.choices?.[0]?.delta;
        if (!delta) return;

        // 1. Handle explicit reasoning fields (DeepSeek R1 / OpenRouter)
        // Priority: reasoning_details > reasoning > reasoning_content (avoid duplicates)
        let explicitReasoning = "";

        if (delta.reasoning_details) {
            // Prefer reasoning_details as it's more structured
            if (Array.isArray(delta.reasoning_details)) {
                 const reasoningTexts = delta.reasoning_details.map((item: any) => {
                   if (typeof item === 'string') return item;
                   return item?.t || item?.text || item?.content || item?.reasoning || '';
                 }).filter(Boolean);
                 explicitReasoning = reasoningTexts.join('');
            } else if (typeof delta.reasoning_details === 'string') {
                 explicitReasoning = delta.reasoning_details;
            } else if (typeof delta.reasoning_details === 'object') {
                 explicitReasoning = delta.reasoning_details?.t || delta.reasoning_details?.text ||
                                     delta.reasoning_details?.content || '';
            }
        } else if (delta.reasoning) {
            // Fallback to reasoning field
            explicitReasoning = delta.reasoning;
        } else if (delta.reasoning_content) {
            // Fallback to reasoning_content field
            explicitReasoning = delta.reasoning_content;
        }

        // 2. Handle content and potential <think> tags
        let content = delta.content || "";
        let derivedReasoning = "";

        if (content) {
          // Check for thinking start tag
          if (content.includes('<think>')) {
            isThinkingInContent = true;
            const parts = content.split('<think>');
            content = parts[0]; 
            derivedReasoning += parts[1] || "";
          } 
          // Check for thinking end tag
          else if (content.includes('</think>')) {
            isThinkingInContent = false;
            const parts = content.split('</think>');
            derivedReasoning += parts[0];
            content = parts[1] || "";
          } 
          // If inside thinking block
          else if (isThinkingInContent) {
            derivedReasoning += content;
            content = "";
          }
        }

        if (explicitReasoning || derivedReasoning || content) {
          const finalReasoning = (explicitReasoning || "") + (derivedReasoning || "");
          onChunk(content, finalReasoning || null);
        }

      } catch (e) {
        console.warn("Failed to parse stream chunk:", e);
      }
    }

  } catch (error: any) {
    if (error.name === 'AbortError') {
      return; // Ignore abort errors
    }
    console.error("Stream Error:", error);
    throw error;
  }
};