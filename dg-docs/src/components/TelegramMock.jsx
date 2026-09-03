import React from 'react';

// Static mockup of a chat with @dgift_bot, styled after Telegram's own look
// (header blue #54A9EB, bubble radius/shadow) and using the bot's REAL
// welcome text and inline-query result format, taken as-is from
// dgift_bot/main.py (WELCOME_MESSAGES['ru'], inline_query()). Not a live
// embed — Telegram chats can't be iframed from a docs site — and not a real
// screenshot either, for the same reason as <ExtensionMock/> (no network
// access to Telegram from this environment). See the note under the mockup.
export default function TelegramMock() {
  return (
    <div
      style={{
        border: '1px solid var(--ifm-color-emphasis-300)',
        borderRadius: 10,
        overflow: 'hidden',
        maxWidth: 420,
        margin: '1.5rem auto',
        fontFamily: 'var(--ifm-font-family-base)',
        boxShadow: '0 2px 10px rgba(0,0,0,.15)',
      }}
    >
      <div
        style={{
          background: '#54A9EB',
          color: '#fff',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          ☸
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>Dhamma Gift Bot</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>@dgift_bot · @dhammagift_bot</div>
        </div>
      </div>

      <div style={{ background: '#c8dceb', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            background: '#fff',
            color: '#222',
            borderRadius: '12px 12px 12px 2px',
            padding: '8px 12px',
            fontSize: 13,
            lineHeight: 1.5,
            maxWidth: '92%',
            boxShadow: '0 1px 2px rgba(0,0,0,.15)',
          }}
        >
          Добро пожаловать в Dhamma Gift Bot!
          <br />
          <br />
          🔍 <strong>Как использовать:</strong>
          <br />
          ⌨️ Напишите <code>@dgift_bot</code> или <code>@dhammagift_bot</code> в любом чате и
          начните печатать слово или номер сутты (например, <code>sn12.2</code>)
        </div>

        <div style={{ alignSelf: 'flex-end', maxWidth: '92%' }}>
          <div
            style={{
              background: '#effdde',
              color: '#222',
              borderRadius: '12px 12px 2px 12px',
              padding: '8px 12px',
              fontSize: 13,
              boxShadow: '0 1px 2px rgba(0,0,0,.15)',
            }}
          >
            ✏️ Отправить: kacchapa
            <br />
            <a href="#" onClick={(e) => e.preventDefault()} style={{ color: '#2678b6' }}>
              🔎 Найти на Dhamma.Gift
            </a>{' '}
            ·{' '}
            <a href="#" onClick={(e) => e.preventDefault()} style={{ color: '#2678b6' }}>
              📖 Словарь
            </a>
          </div>
          <div style={{ fontSize: 10, color: '#5a7185', textAlign: 'right', marginTop: 2 }}>
            via @dgift_bot
          </div>
        </div>
      </div>
    </div>
  );
}
