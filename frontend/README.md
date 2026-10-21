# Twinkle Frontend

Исходники CEF-интерфейсов: Vue 3, TypeScript, Pinia и Vite. Контекст и карта систем приведены в [основном README](../README.md).

```bash
npm ci
npm run dev
```

В локальной разработке доступны `?page=auth`, `?page=rent-car`, `?page=tablet`, `?page=hud`, `?page=ls-customs`, `?page=government-computer`, `?page=characterSelection` и `?page=selectSpawn`.

`npm run build` собирает CEF в `../client_packages/cef`. `npm run build:demo` собирает браузерную витрину с тестовыми данными в `../docs/demo`. Браузерное демо не воспроизводит сервер и не является полноценной игровой сессией.
