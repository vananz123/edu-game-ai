export function buildGenerationOptions(
  mode: 'local' | 'online',
  maxTokens: number
): { max_tokens: number; chat_template_kwargs?: { enable_thinking: false } } {
  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error('Giới hạn token đầu ra AI phải là số nguyên dương.');
  }
  return {
    max_tokens: maxTokens,
    ...(mode === 'local' ? { chat_template_kwargs: { enable_thinking: false as const } } : {})
  };
}
