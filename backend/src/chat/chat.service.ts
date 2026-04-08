import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessageDto, ChatRequestDto } from './dto/chat-request.dto';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_details?: unknown;
    };
  }>;
  error?: { message?: string };
}

@Injectable()
export class ChatService {
  constructor(private readonly configService: ConfigService) {}

  async complete(
    body: ChatRequestDto,
  ): Promise<{ content: string; reasoning_details?: unknown }> {
    const openrouterKey = this.configService
      .get<string>('OPENROUTER_API_KEY')
      ?.trim();
    const qwenKey = this.configService.get<string>('QWEN_API_KEY')?.trim();

    if (openrouterKey) {
      return this.completeOpenRouter(body, openrouterKey);
    }

    if (qwenKey) {
      return this.completeDashScope(body, qwenKey);
    }

    throw new ServiceUnavailableException(
      'Set OPENROUTER_API_KEY or QWEN_API_KEY in backend .env to use the chat assistant.',
    );
  }

  private buildOpenRouterMessages(messages: ChatMessageDto[]) {
    return messages.map((m) => {
      const row: Record<string, unknown> = {
        content: m.content,
        role: m.role,
      };
      if (
        m.role === 'assistant' &&
        m.reasoning_details !== undefined &&
        m.reasoning_details !== null
      ) {
        row.reasoning_details = m.reasoning_details;
      }
      return row;
    });
  }

  private async completeOpenRouter(
    body: ChatRequestDto,
    apiKey: string,
  ): Promise<{ content: string; reasoning_details?: unknown }> {
    const baseUrl = this.configService
      .get<string>('OPENROUTER_API_BASE')!
      .replace(/\/$/, '');
    const model = this.configService.get<string>('OPENROUTER_MODEL')!;
    const reasoningDefault = this.configService.get<boolean>(
      'OPENROUTER_REASONING_ENABLED',
    )!;

    const url = `${baseUrl}/chat/completions`;
    const hasPriorAssistant = body.messages.some((m) => m.role === 'assistant');

    const payload: Record<string, unknown> = {
      messages: this.buildOpenRouterMessages(body.messages),
      model,
      stream: false,
    };

    if (!hasPriorAssistant && reasoningDefault) {
      payload.reasoning = { enabled: true };
    }

    const response = await fetch(url, {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    const data = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      const msg =
        data?.error?.message ||
        `OpenRouter error (${response.status}). Check OPENROUTER_API_KEY and OPENROUTER_MODEL.`;
      throw new ServiceUnavailableException(msg);
    }

    const message = data.choices?.[0]?.message;
    const rawContent = message?.content;
    const content =
      typeof rawContent === 'string' ? rawContent.trim() : String(rawContent ?? '').trim();
    const reasoning_details = message?.reasoning_details;

    if (!content && reasoning_details == null) {
      throw new ServiceUnavailableException(
        'Model returned an empty reply. Try again or change OPENROUTER_MODEL.',
      );
    }

    const out: { content: string; reasoning_details?: unknown } = {
      content: content || '',
    };
    if (reasoning_details !== undefined) {
      out.reasoning_details = reasoning_details;
    }
    return out;
  }

  private async completeDashScope(
    body: ChatRequestDto,
    apiKey: string,
  ): Promise<{ content: string }> {
    const baseUrl = this.configService
      .get<string>('QWEN_API_BASE')!
      .replace(/\/$/, '');
    const model = this.configService.get<string>('QWEN_MODEL')!;

    const url = `${baseUrl}/chat/completions`;

    const response = await fetch(url, {
      body: JSON.stringify({
        messages: body.messages.map((m) => ({
          content: m.content,
          role: m.role,
        })),
        model,
        stream: false,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    const data = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      const msg =
        data?.error?.message ||
        `Qwen API error (${response.status}). Check QWEN_API_KEY and QWEN_MODEL.`;
      throw new ServiceUnavailableException(msg);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ServiceUnavailableException(
        'Qwen returned an empty reply. Try again or switch QWEN_MODEL.',
      );
    }

    return { content };
  }
}
