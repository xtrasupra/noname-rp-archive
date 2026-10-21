"use strict";

global.uiBrowser = global.uiBrowser || null;

const DEFAULT_RETRY_DELAYS = [0, 100, 300, 700];
const retryTimers = new Map();

function parseJson(value, fallback = {}) {
    try {
        if (!value) return fallback;
        if (typeof value === "object") return value;
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getBrowser() {
    try {
        if (global.interfaceLock?.getUiBrowser) {
            return global.interfaceLock.getUiBrowser();
        }

        if (!global.uiBrowser) {
            global.uiBrowser = mp.browsers.new("package://cef/index.html");
        }

        return global.uiBrowser;
    } catch (error) {
        try {
            mp.console.logError(`[UI LOADER BROWSER ERROR] ${error.message}`);
        } catch {}
        return null;
    }
}

function execute(code) {
    try {
        const browser = getBrowser();
        if (!browser || typeof browser.execute !== "function") return false;
        browser.execute(code);
        return true;
    } catch (error) {
        try {
            mp.console.logError(`[UI LOADER EXEC ERROR] ${error.message}`);
        } catch {}
        return false;
    }
}

function clearRetry(key) {
    const timers = retryTimers.get(key);
    if (!timers) return;

    timers.forEach((timer) => {
        try {
            clearTimeout(timer);
        } catch {}
    });

    retryTimers.delete(key);
}

function setCursor(state) {
    try {
        mp.gui.cursor.show(Boolean(state), Boolean(state));
    } catch {}
}

function setChat(active) {
    try {
        mp.gui.chat.activate(Boolean(active));
    } catch {}
}

function notify(message, variant = "info", duration) {
    try {
        if (global.interfaceLock?.notify) {
            global.interfaceLock.notify(message, variant, duration);
            return;
        }

        if (typeof global.notify === "function") {
            global.notify(message, variant, duration);
            return;
        }

        mp.gui.chat.push(String(message));
    } catch {}
}

function getState() {
    try {
        return global.interfaceLock?.getInterfaceState?.() || {
            activePage: null,
            hudVisible: false,
            chatOpened: false,
            controlsBlocked: false,
        };
    } catch {
        return {
            activePage: null,
            hudVisible: false,
            chatOpened: false,
            controlsBlocked: false,
        };
    }
}

function normalizePayload(payload) {
    return parseJson(payload, {});
}

function buildPageEnvelope(payload = {}, options = {}) {
    const safePayload = normalizePayload(payload);

    if (options.spreadPayload === false) {
        return {
            props: {
                payload: safePayload,
                initialPayload: safePayload,
            },
            payload: {
                payload: safePayload,
                initialPayload: safePayload,
            },
            safePayload,
        };
    }

    return {
        props: {
            ...safePayload,
            payload: safePayload,
            initialPayload: safePayload,
        },
        payload: {
            ...safePayload,
            payload: safePayload,
            initialPayload: safePayload,
        },
        safePayload,
    };
}

function pushToCef(page, payload = {}, options = {}) {
    const safePayload = normalizePayload(payload);
    const json = JSON.stringify(safePayload);
    const eventName = options.eventName || `twinkle:${page}:update`;
    const globalName = options.globalName || `__TWINKLE_${String(page).toUpperCase()}_PAYLOAD__`;
    const apiName = options.apiName || "";
    const apiMethod = options.apiMethod || "setPayload";

    execute(`
        try {
            const payload = ${json};
            window[${JSON.stringify(globalName)}] = payload;

            window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, {
                detail: payload
            }));

            window.dispatchEvent(new CustomEvent("twinkle:ui:update", {
                detail: {
                    page: ${JSON.stringify(page)},
                    payload
                }
            }));

            const pageId = ${JSON.stringify(page)};
            const browserSnapshot =
                typeof window.twinkleBrowser?.getSnapshot === "function"
                    ? window.twinkleBrowser.getSnapshot()
                    : null;
            const activeInterfaces = browserSnapshot?.activeInterfaces || [];
            const currentPage = browserSnapshot?.currentPage || null;

            if (${JSON.stringify(eventName === `twinkle:${page}:update`)} && window.twinkleBrowser) {
                if (
                    (pageId === "hud" || currentPage === pageId) &&
                    typeof window.twinkleBrowser.setPage === "function"
                ) {
                    window.twinkleBrowser.setPage(pageId, payload, payload);
                } else if (
                    activeInterfaces.includes(pageId) &&
                    typeof window.twinkleBrowser.interfaces?.open === "function"
                ) {
                    window.twinkleBrowser.interfaces.open(pageId, payload);
                }
            }

            if (
                ${JSON.stringify(apiName)} &&
                window[${JSON.stringify(apiName)}] &&
                typeof window[${JSON.stringify(apiName)}][${JSON.stringify(apiMethod)}] === "function"
            ) {
                window[${JSON.stringify(apiName)}][${JSON.stringify(apiMethod)}](payload);
            }
        } catch (error) {
            console.log("[UI LOADER PUSH ERROR]", ${JSON.stringify(page)}, error);
        }
    `);
}

function pushReliable(page, payload = {}, options = {}) {
    const key = options.retryKey || `${page}:${options.eventName || "update"}`;
    clearRetry(key);

    const timers = [];
    const delays = Array.isArray(options.retryDelays) ? options.retryDelays : DEFAULT_RETRY_DELAYS;

    delays.forEach((delay) => {
        if (Number(delay) <= 0) {
            pushToCef(page, payload, options);
            return;
        }

        timers.push(setTimeout(() => {
            pushToCef(page, payload, options);
        }, Number(delay)));
    });

    retryTimers.set(key, timers);
}

function open(page, payload = {}, options = {}) {
    page = String(page);
    const envelope = buildPageEnvelope(payload, options);
    const state = getState();

    if (options.exclusive !== false && state.activePage && state.activePage !== page && !options.force) {
        return false;
    }

    let opened = false;

    try {
        if (global.interfaceLock?.openPage) {
            opened = options.force && global.interfaceLock.forceOpenPage
                ? global.interfaceLock.forceOpenPage(page, envelope.props, envelope.payload)
                : global.interfaceLock.openPage(page, envelope.props, envelope.payload, {
                    force: Boolean(options.force),
                });
        } else if (typeof global.openPage === "function") {
            global.openPage(page, envelope.props, envelope.payload);
            opened = true;
        }
    } catch (error) {
        try {
            mp.console.logError(`[UI LOADER OPEN ERROR] ${page}: ${error.message}`);
        } catch {}
        opened = false;
    }

    if (!opened) {
        return false;
    }

    if (options.cursor !== false) setCursor(true);
    if (options.chat === false) setChat(false);

    if (global.uiState?.remember && options.cache !== false) {
        global.uiState.remember(page, envelope.safePayload, {
            ...(options.pushOptions || options),
            push: false,
        });
    }

    if (options.push !== false) {
        pushReliable(page, envelope.safePayload, options.pushOptions || options);
    }

    return true;
}

function update(page, payload = {}, options = {}) {
    page = String(page);
    if (global.uiState?.remember && options.cache !== false) {
        global.uiState.remember(page, normalizePayload(payload), {
            ...(options.pushOptions || options),
            push: false,
        });
    }
    pushReliable(page, payload, options.pushOptions || options);
}

function emit(page, eventName, payload = {}, options = {}) {
    page = String(page);
    if (global.uiState?.rememberEvent && options.cache !== false) {
        global.uiState.rememberEvent(page, eventName, normalizePayload(payload), options);
    }
    pushReliable(page, payload, {
        ...options,
        eventName,
        retryKey: options.retryKey || `${page}:${eventName}`,
    });
}

function close(page, options = {}) {
    page = String(page);

    try {
        if (options.pushClose) {
            pushToCef(page, {}, {
                ...options,
                eventName: options.closeEventName || `twinkle:${page}:close`,
                retryKey: `${page}:close`,
            });
        }

        if (global.interfaceLock?.closePage) {
            global.interfaceLock.closePage(page);
        } else if (typeof global.closePage === "function") {
            global.closePage(page);
        }
    } catch (error) {
        try {
            mp.console.logError(`[UI LOADER CLOSE ERROR] ${page}: ${error.message}`);
        } catch {}
    }

    if (options.chat !== false) setChat(true);
}

function closeAll() {
    try {
        if (global.interfaceLock?.closeAllPages) {
            global.interfaceLock.closeAllPages();
        } else if (typeof global.closeAllPages === "function") {
            global.closeAllPages();
        }
    } catch {}
}

function canOpen(page) {
    try {
        return global.interfaceLock?.canOpenPage?.(page) ?? true;
    } catch {
        return true;
    }
}

global.ui = {
    getBrowser,
    execute,

    open,
    update,
    emit,
    close,
    closeAll,

    notify,
    getState,
    canOpen,

    parseJson,
    pushToCef,
    pushReliable,
};

console.log("[UI LOADER] Loaded");
