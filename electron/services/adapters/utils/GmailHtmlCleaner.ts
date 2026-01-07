/**
 * Gmail HTML内容清理工具类
 * 负责从HTML邮件内容中提取纯文本
 */

import { gmail_v1 } from 'googleapis';

export class GmailHtmlCleaner {
  /**
   * 提取邮件内容
   */
  public static extractMessageContent(payload: gmail_v1.Schema$MessagePart): string {
    let content = '';

    // 优先使用 text/plain，如果没有再使用 text/html
    let plainTextContent = '';
    let htmlContent = '';

    // 如果有body数据
    if (payload.body?.data) {
      const decodedContent = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      if (payload.mimeType === 'text/plain') {
        plainTextContent = decodedContent;
      } else if (payload.mimeType === 'text/html') {
        htmlContent = decodedContent;
      }
    }

    // 如果是多部分消息，递归提取
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain') {
          // 直接提取纯文本部分
          if (part.body?.data) {
            const partText = Buffer.from(part.body.data, 'base64').toString('utf-8');
            if (partText.trim()) {
              plainTextContent += partText + '\n';
            }
          }
        } else if (part.mimeType === 'text/html') {
          // 提取 HTML 部分（稍后统一清理）
          if (part.body?.data) {
            const partHtml = Buffer.from(part.body.data, 'base64').toString('utf-8');
            if (partHtml.trim()) {
              htmlContent += partHtml + '\n';
            }
          }
        } else if (part.parts) {
          // 递归处理嵌套的多部分消息
          const nestedContent = this.extractMessageContent(part);
          if (nestedContent.trim()) {
            plainTextContent += nestedContent + '\n';
          }
        }
      }
    }

    // 优先使用纯文本，如果没有则清理HTML
    if (plainTextContent.trim()) {
      content = plainTextContent;
    } else if (htmlContent.trim()) {
      content = this.cleanHtmlContent(htmlContent);
    }

    return content.trim();
  }

  /**
   * 清理HTML内容，提取纯文本
   */
  public static cleanHtmlContent(html: string): string {
    let text = html;

    // 移除 <head> 标签及其内容
    text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

    // 移除 <style> 标签及其内容
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // 移除 <script> 标签及其内容
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    // 移除 HTML 注释
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // 移除内联样式属性中的 CSS
    text = text.replace(/style\s*=\s*["'][^"']*["']/gi, '');

    // 移除 CSS 代码块（即使不在 style 标签中）
    // 匹配 CSS 选择器和规则块
    text = text.replace(/[.#]?[\w-]+\s*\{[^}]*\}/g, '');
    text = text.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
    text = text.replace(/@[\w-]+[^{]*\{[^}]*\}/g, '');

    // 将常见的块级元素转换为换行符
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<p[^>]*>/gi, '');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<div[^>]*>/gi, '');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    text = text.replace(/<h[1-6][^>]*>/gi, '');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '• ');
    text = text.replace(/<\/tr>/gi, '\n');
    text = text.replace(/<td[^>]*>/gi, ' ');
    text = text.replace(/<\/table>/gi, '\n');
    text = text.replace(/<table[^>]*>/gi, '');

    // 移除所有其他 HTML 标签
    text = text.replace(/<[^>]*>/g, '');

    // 解码 HTML 实体（在移除标签之后）
    text = this.decodeHtmlEntities(text);

    // 移除零宽字符和其他不可见字符
    text = text.replace(/[\u200B-\u200D\uFEFF\u034F]/g, ''); // 零宽空格、零宽连接符等
    text = text.replace(/\u00A0/g, ' '); // 不间断空格

    // 移除 CSS 属性（如果还有残留）
    text = text.replace(/[\w-]+\s*:\s*[^;]+;/g, '');

    // 清理多余的空白字符
    text = text.replace(/\t/g, ' ');
    text = text.replace(/ {2,}/g, ' '); // 多个空格替换为单个空格
    text = text.replace(/\n[ \t]+/g, '\n'); // 移除行首空白
    text = text.replace(/[ \t]+\n/g, '\n'); // 移除行尾空白
    text = text.replace(/\n{3,}/g, '\n\n'); // 多个换行替换为两个换行

    // 移除每行首尾的空白，并过滤空行
    text = text.split('\n')
      .map(line => line.trim())
      .filter(line => {
        // 过滤掉只包含特殊字符或CSS残留的行
        if (line.length === 0) return false;
        if (/^[{}();:,\s]*$/.test(line)) return false;
        if (/^[\w-]+\s*:\s*/.test(line)) return false; // CSS 属性行
        return true;
      })
      .join('\n');

    // 移除常见的邮件签名和元数据
    text = this.removeEmailMetadata(text);

    // 移除开头和结尾的空白
    text = text.trim();

    return text;
  }

  /**
   * 移除邮件签名和元数据
   */
  private static removeEmailMetadata(text: string): string {
    // 移除 "Unsubscribe" 链接及其后的内容
    text = text.replace(/Unsubscribe[\s\S]*$/i, '');

    // 移除 "This email was intended for" 及其后的内容
    text = text.replace(/This email was intended for[\s\S]*$/i, '');

    // 移除常见的邮件底部信息
    text = text.replace(/View this email in your browser[\s\S]*$/i, '');
    text = text.replace(/Click here to view[\s\S]*$/i, '');
    text = text.replace(/View More Posts[\s\S]*$/i, '');
    text = text.replace(/Hide r\/[\s\S]*$/i, '');

    // 移除邮件地址和联系信息
    text = text.replace(/\d+\s+[\w\s]+St\.,?\s*#?\d*,?\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5}[-\d]*/gi, '');

    // 移除过长的重复字符（通常是邮件模板的填充）
    text = text.replace(/(.)\1{20,}/g, '');

    // 移除只包含数字和特殊字符的行
    const lines = text.split('\n');
    const cleanedLines = lines.filter(line => {
      const trimmed = line.trim();
      // 过滤掉只有数字、空格和特殊字符的行
      if (/^[\d\s\W]*$/.test(trimmed) && trimmed.length < 50) {
        return false;
      }
      return true;
    });

    return cleanedLines.join('\n').trim();
  }

  /**
   * 解码 HTML 实体
   */
  private static decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
      '&euro;': '€',
      '&pound;': '£',
      '&yen;': '¥',
      '&cent;': '¢',
      '&sect;': '§',
      '&deg;': '°',
      '&plusmn;': '±',
      '&para;': '¶',
      '&middot;': '·',
      '&bull;': '•',
      '&hellip;': '…',
      '&prime;': '′',
      '&Prime;': '″',
      '&lsaquo;': '‹',
      '&rsaquo;': '›',
      '&ndash;': '–',
      '&mdash;': '—',
      '&zwnj;': '',
      '&zwj;': '',
    };

    let decoded = text;

    // 先解码命名实体
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // 解码数字实体 (如 &#8217; 或 &#847;)
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      const code = parseInt(dec, 10);
      // 过滤掉零宽字符和其他不可见字符
      if (code === 8203 || code === 8204 || code === 8205 || code === 8206 || code === 8207 ||
        code === 847 || code === 65279) {
        return '';
      }
      return String.fromCharCode(code);
    });

    // 解码十六进制实体 (如 &#x2019;)
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      // 过滤掉零宽字符
      if (code === 0x200B || code === 0x200C || code === 0x200D || code === 0xFEFF) {
        return '';
      }
      return String.fromCharCode(code);
    });

    return decoded;
  }
}