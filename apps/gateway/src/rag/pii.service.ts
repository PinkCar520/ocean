import { Injectable } from '@nestjs/common';

export interface PIIRule {
  name: string;
  regex: RegExp;
  replace: string;
}

@Injectable()
export class PIIService {
  // 银行场景下的敏感信息脱敏规则
  private readonly rules: PIIRule[] = [
    {
      name: 'BANK_CARD',
      regex: /\b\d{16,19}\b/g,
      replace: '****-****-****-****',
    },
    {
      name: 'PHONE',
      regex: /\b1[3-9]\d{9}\b/g,
      replace: '138****0000',
    },
    {
      name: 'ID_CARD',
      regex: /\b\d{17}[\dXx]\b/g,
      replace: '******************',
    },
    {
      name: 'EMAIL',
      regex: /\b[\w.-]+@[\w.-]+\.\w{2,4}\b/g,
      replace: '***@***.com',
    },
    {
      name: 'PASSWORD_FIELD',
      regex: /(password|passwd|secret|key|token)["']?\s*[:=]\s*["']?([^"'\s,]+)["']?/gi,
      replace: '$1: "********"',
    },
  ];

  /**
   * 对文本进行 PII 脱敏处理
   */
  mask(text: string): string {
    if (!text) return text;
    let masked = text;
    
    for (const rule of this.rules) {
      masked = masked.replace(rule.regex, rule.replace);
    }
    
    return masked;
  }

  /**
   * 检查文本中是否包含敏感信息（用于审计日志）
   */
  hasSensitiveInfo(text: string): boolean {
    return this.rules.some(rule => rule.regex.test(text));
  }
}
