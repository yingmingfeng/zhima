window.__ModuleLoader__.load({
	id: "@zhima/dsh-client-advanced-shell",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		/**
		* Resolve three desktop columns without allowing details to squeeze the conversation below its floor.
		* @param viewport - available frame width.
		* @param sidebar - sidebar preference, where zero selects the compact rail.
		* @param details - details preference, where zero closes the panel.
		* @returns rendered column widths.
		*/
		function computeDesktopColumns(viewport, sidebar, details, collapsedWidth = 56) {
			const sidebarWidth = sidebar === 0 ? collapsedWidth : clamp(sidebar, 264, 420);
			const preferredDetails = details === 0 ? 0 : clamp(details, 300, 520);
			if (sidebarWidth + preferredDetails + 640 <= viewport) return {
				sidebar: sidebarWidth,
				center: viewport - sidebarWidth - preferredDetails,
				details: preferredDetails
			};
			const reducedDetails = preferredDetails === 0 ? 0 : Math.max(300, viewport - sidebarWidth - 640);
			if (sidebarWidth + reducedDetails + 640 <= viewport) return {
				sidebar: sidebarWidth,
				center: 640,
				details: reducedDetails
			};
			return {
				sidebar: sidebarWidth,
				center: Math.max(0, viewport - sidebarWidth),
				details: 0
			};
		}
		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, Math.round(value)));
		}
		/** Small observable panel controller used by the advanced root registration. */
		var DesktopLayoutState = class {
			snapshot = Object.freeze({
				sidebar: 280,
				details: 0,
				narrow: false,
				narrowExpanded: false
			});
			listeners = /* @__PURE__ */ new Set();
			/** @returns the immutable current panel snapshot. */
			getSnapshot() {
				return this.snapshot;
			}
			/** @param listener - callback notified after a snapshot replacement. @returns its disposer. */
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Toggle the wide sidebar and the platform-selected compact rail. */
			toggleSidebar() {
				if (this.snapshot.narrow) {
					this.publish({
						...this.snapshot,
						narrowExpanded: !this.snapshot.narrowExpanded
					});
					return;
				}
				this.publish({
					...this.snapshot,
					sidebar: this.snapshot.sidebar === 0 ? 280 : 0
				});
			}
			/** @param narrow - whether the frame is below the automatic-collapse breakpoint. */
			setNarrow(narrow) {
				if (this.snapshot.narrow === narrow) return;
				this.publish({
					...this.snapshot,
					narrow,
					narrowExpanded: false
				});
			}
			/** Open details at its default width. */
			openDetails() {
				if (this.snapshot.details === 0) this.publish({
					...this.snapshot,
					details: 360
				});
			}
			/** Close details while keeping its slot mounted. */
			closeDetails() {
				if (this.snapshot.details !== 0) this.publish({
					...this.snapshot,
					details: 0
				});
			}
			/** @param width - requested sidebar width from a resize gesture. */
			setSidebar(width) {
				this.publish({
					...this.snapshot,
					sidebar: clamp(width, 264, 420)
				});
			}
			/** @param width - requested details width from a resize gesture. */
			setDetails(width) {
				this.publish({
					...this.snapshot,
					details: clamp(width, 300, 520)
				});
			}
			publish(next) {
				this.snapshot = Object.freeze(next);
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/AdvancedFrame.tsx
		/** Desktop-owned transparent frame around the unchanged product surfaces. */
		function AdvancedFrame({ layout, platform, renderSlot, useSessions }) {
			const subscribeLayout = (0, react.useCallback)((listener) => layout.subscribe(listener), [layout]);
			const readLayout = (0, react.useCallback)(() => layout.getSnapshot(), [layout]);
			const panels = (0, react.useSyncExternalStore)(subscribeLayout, readLayout);
			const frameRef = (0, react.useRef)(null);
			const [viewport, setViewport] = (0, react.useState)(() => window.innerWidth);
			const detailsSession = useSessions((state) => {
				const current = state.current;
				return current !== void 0 && state.byId[current]?.blank === false ? current : void 0;
			});
			(0, react.useEffect)(() => {
				const element = frameRef.current;
				if (element === null) return;
				let raf = null;
				const observer = new ResizeObserver(() => {
					raf ??= requestAnimationFrame(() => {
						raf = null;
						const width = element.getBoundingClientRect().width;
						if (width > 0) setViewport(width);
					});
				});
				observer.observe(element);
				return () => {
					observer.disconnect();
					if (raf !== null) cancelAnimationFrame(raf);
				};
			}, []);
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			(0, react.useEffect)(() => {
				layout.setNarrow(narrow);
			}, [layout, narrow]);
			const previousSession = (0, react.useRef)(detailsSession);
			(0, react.useLayoutEffect)(() => {
				if (detailsSession === void 0) return;
				if (previousSession.current !== void 0 && previousSession.current !== detailsSession) layout.closeDetails();
				previousSession.current = detailsSession;
			}, [detailsSession, layout]);
			const collapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0;
			const columns = computeDesktopColumns(viewport, collapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar, detailsSession === void 0 ? 0 : panels.details, platform === "darwin" ? 90 : 56);
			const sidebarOwnerWidth = collapsed ? 56 : columns.sidebar;
			const columnsRef = (0, react.useRef)(columns);
			columnsRef.current = columns;
			const sidebarBase = (0, react.useRef)(0);
			const detailsBase = (0, react.useRef)(0);
			const [dragging, setDragging] = (0, react.useState)(false);
			const onDragEnd = (0, react.useCallback)(() => {
				setDragging(false);
			}, []);
			const onSidebarStart = (0, react.useCallback)(() => {
				sidebarBase.current = columnsRef.current.sidebar;
				setDragging(true);
			}, []);
			const onDetailsStart = (0, react.useCallback)(() => {
				detailsBase.current = columnsRef.current.details;
				setDragging(true);
			}, []);
			const onSidebarDrag = (0, react.useCallback)((dx) => {
				layout.setSidebar(sidebarBase.current + dx);
			}, [layout]);
			const onDetailsDrag = (0, react.useCallback)((dx) => {
				layout.setDetails(detailsBase.current - dx);
			}, [layout]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: frameRef,
				className: "dshDesktopFrame",
				"data-desktop-platform": platform,
				"data-sidebar-collapsed": collapsed || void 0,
				"data-details-collapsed": columns.details === 0 || void 0,
				"data-dragging": dragging || void 0,
				style: { gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px` },
				children: [
					platform === "darwin" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopMacCaptionRow",
						"aria-hidden": "true"
					}),
					platform === "win32" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopWindowsCaptionRow",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
						className: "dshDesktopSidebarSurface",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshDesktopUpstreamSidebar",
							children: renderSlot("sidebar", {
								collapsed,
								width: sidebarOwnerWidth
							})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
						className: "dshDesktopConversationSurface",
						children: renderSlot("conversation", {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
						className: "dshDesktopDetailsSurface",
						children: renderSlot("details", {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopOverlay",
						"data-shell-overlay": true,
						children: renderSlot("shell.overlay", {})
					}),
					!collapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResizeHandle, {
						side: "sidebar",
						left: columns.sidebar,
						onStart: onSidebarStart,
						onDrag: onSidebarDrag,
						onEnd: onDragEnd
					}),
					columns.details > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResizeHandle, {
						side: "details",
						left: viewport - columns.details,
						onStart: onDetailsStart,
						onDrag: onDetailsDrag,
						onEnd: onDragEnd
					})
				]
			});
		}
		function ResizeHandle(props) {
			const [dragging, setDragging] = (0, react.useState)(false);
			const origin = (0, react.useRef)(0);
			const latest = (0, react.useRef)(0);
			const frame = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)({
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			});
			callbacks.current = {
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			};
			const onPointerDown = (0, react.useCallback)((event) => {
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				origin.current = event.clientX;
				latest.current = event.clientX;
				callbacks.current.onStart();
				setDragging(true);
			}, []);
			const onPointerMove = (0, react.useCallback)((event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				latest.current = event.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					callbacks.current.onDrag(latest.current - origin.current);
				});
			}, []);
			const onPointerUp = (0, react.useCallback)((event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				event.currentTarget.releasePointerCapture(event.pointerId);
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
				callbacks.current.onDrag(latest.current - origin.current);
				setDragging(false);
				callbacks.current.onEnd();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshDesktopResizeHandle",
				"data-side": props.side,
				"data-dragging": dragging || void 0,
				style: { left: props.left },
				onPointerDown,
				onPointerMove,
				onPointerUp
			});
		}
		//#endregion
		//#region src/client/layout-service.ts
		/**
		* Provide the advanced layout service for one plugin-fiber lifetime.
		* @param ctx - active browser Cordis context.
		* @param layout - desktop-owned layout implementation.
		* @returns disposer for the service registration.
		*/
		function provideDesktopLayout(ctx, layout) {
			const dispose = ctx.reflect.provide("layout", layout);
			return () => {
				dispose();
			};
		}
		//#endregion
		//#region src/client/styles.ts
		/** Advanced-shell stylesheet kept as a plain string so the package client bundle stays self-contained. */
		const ADVANCED_STYLES = `
html, body, #root { width: 100%; height: 100%; }
body[data-dsh-desktop-mode="advanced"] { margin: 0; background: transparent !important; }
.dshDesktopFrame { position: relative; display: grid; grid-template-rows: 100%; width: 100%; height: 100%; overflow: hidden; background: transparent; transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopSidebarSurface { --dsw-specific-sidebar-fill: transparent; position: relative; grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; background: transparent; border-right: 1px solid var(--dsw-alias-border-l1); }
.dshDesktopUpstreamSidebar { box-sizing: border-box; width: 100%; height: 100%; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopUpstreamSidebar { padding-top: 20px; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"][data-sidebar-collapsed] .dshDesktopUpstreamSidebar { width: 56px; margin: 0 auto; }
.dshDesktopFrame[data-desktop-platform="darwin"] { grid-template-rows: 20px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface { grid-row: 1 / -1; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface::before { content: ""; position: absolute; top: 0; right: 0; left: 80px; height: 32px; user-select: none; -webkit-app-region: drag; }
.dshDesktopMacCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopMacCaptionRow::before { content: ""; position: absolute; top: 0; right: 0; left: 0; height: 32px; user-select: none; -webkit-app-region: drag; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
.dshDesktopDetailsSurface { grid-column: 3; grid-row: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l2); }
.dshDesktopFrame[data-details-collapsed] .dshDesktopDetailsSurface { border-left: none; }
.dshDesktopFrame[data-desktop-platform="win32"] { grid-template-rows: 32px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopSidebarSurface { grid-row: 1 / -1; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopWindowsCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopWindowsCaptionRow::before { content: ""; position: absolute; inset: 0 138px 0 0; user-select: none; -webkit-app-region: drag; }
.dshDesktopFrame[data-dragging] { transition: none; }
.dshDesktopOverlay { position: absolute; z-index: 1000; inset: 0; pointer-events: none; }
.dshDesktopOverlay > * { pointer-events: auto; }
.dshDesktopResizeHandle { position: absolute; z-index: 50; top: 0; bottom: 0; width: 8px; margin-left: -4px; cursor: col-resize; touch-action: none; -webkit-app-region: no-drag; transition: left var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopFrame[data-dragging] .dshDesktopResizeHandle { transition: none; }
.dshDesktopNoDrag, button, input, textarea, select, a, [role="button"], [role="dialog"], [role="presentation"] { -webkit-app-region: no-drag; }
[role="dialog"], [aria-modal="true"] { -webkit-app-region: no-drag !important; }
html:has([aria-modal="true"]) .dshDesktopWindowsCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopMacCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface::before { -webkit-app-region: no-drag !important; }
@media (prefers-reduced-motion: reduce) {
  .dshDesktopFrame,
  .dshDesktopResizeHandle { transition: none !important; }
}
`;
		/** Install and remove the advanced shell's global native-window styles. @returns the style disposer. */
		function installAdvancedStyles() {
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-plugin-desktop";
			style.dataset.pluginCss = "dsh-plugin-desktop/advanced-shell";
			style.textContent = ADVANCED_STYLES;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region src/client/theme-presenter.ts
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		/** Projects the resolved theme service snapshot onto the desktop document. */
		var DesktopThemePresenter = class {
			appliedTokens = [];
			themeColorMeta = document.createElement("meta");
			constructor() {
				this.themeColorMeta.name = "theme-color";
			}
			/** @param snapshot - current resolved palette and token overrides. */
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				if (scheme === "dark") document.body.setAttribute(DARK_ATTRIBUTE, "");
				else document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					document.body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				this.themeColorMeta.content = getComputedStyle(document.body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.appendChild(this.themeColorMeta);
			}
			/** Remove only DOM state owned by this presenter. */
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};
		//#endregion
		//#region src/client/advanced-shell.ts
		/**
		* Provide the advanced layout service and own the desktop root slot.
		* @param ctx - active browser Cordis context.
		* @param environment - validated mode and platform marker.
		*/
		function applyAdvancedShell(ctx, environment) {
			if (environment.mode !== "advanced") throw new Error(`dsh-plugin-desktop: advanced shell received mode ${JSON.stringify(environment.mode)}`);
			const desktopLayout = new DesktopLayoutState();
			ctx.effect(() => provideDesktopLayout(ctx, desktopLayout), "desktop: layout service");
			ctx.effect(() => {
				document.body.dataset.dshDesktopMode = "advanced";
				document.body.dataset.dshDesktopPlatform = environment.platform;
				const removeStyles = installAdvancedStyles();
				return () => {
					removeStyles();
					delete document.body.dataset.dshDesktopMode;
					delete document.body.dataset.dshDesktopPlatform;
				};
			}, "desktop: advanced shell styles");
			ctx.effect(() => {
				const presenter = new DesktopThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "desktop: theme presenter");
			ctx.effect(() => ctx.slots.register({
				name: "root",
				children: {
					"sidebar": {
						kind: "single",
						scope: "root"
					},
					"conversation": {
						kind: "single",
						scope: "session-maybe"
					},
					"details": {
						kind: "single",
						scope: "session"
					},
					"shell.overlay": {
						kind: "list",
						scope: "root"
					}
				},
				inject: () => ({
					layout: desktopLayout,
					platform: environment.platform
				})
			}, AdvancedFrame), "desktop: advanced root slot");
		}
		//#endregion
		//#region src/client/environment.ts
		const MODES = /* @__PURE__ */ new Set(["compatibility", "advanced"]);
		const PLATFORMS = /* @__PURE__ */ new Set([
			"darwin",
			"win32",
			"linux"
		]);
		/**
		* Validate the Electron-owned query marker before any desktop client effects run.
		* @param search - URL search string, including or omitting the leading question mark.
		* @returns the validated desktop renderer environment, or undefined outside the desktop shell.
		*/
		function parseDesktopClientEnvironment(search) {
			const params = new URLSearchParams(search);
			const mode = params.get("dsh-desktop-mode");
			const platform = params.get("dsh-desktop-platform");
			if (mode === null && platform === null) return void 0;
			if (!MODES.has(mode)) throw new Error(`dsh-plugin-desktop: invalid or missing dsh-desktop-mode ${JSON.stringify(mode)}`);
			if (!PLATFORMS.has(platform)) throw new Error(`dsh-plugin-desktop: invalid or missing dsh-desktop-platform ${JSON.stringify(platform)}`);
			return {
				mode,
				platform
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Services required by the advanced presentation. */
		const inject = ["slots", "theme"];
		/** Register desktop-owned client surfaces for the current BrowserWindow mode. */
		function apply(ctx) {
			const environment = parseDesktopClientEnvironment(window.location.search);
			if (!environment) return;
			if (environment.mode === "advanced") applyAdvancedShell(ctx, environment);
		}
		//#endregion
		exports.apply = apply;
		exports.applyAdvancedShell = applyAdvancedShell;
		exports.inject = inject;
		exports.parseDesktopClientEnvironment = parseDesktopClientEnvironment;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map