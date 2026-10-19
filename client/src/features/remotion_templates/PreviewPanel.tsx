/** 隔离预览容器；仅向当前成功版本的 iframe 发送参数与背景直链，清理消息监听和就绪超时。 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Film, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "./api";
import { backgroundUrl, type Values, type Version } from "./model";
import { Spinner } from "@/components/ui/spinner";

/** 背景链接不进入生成请求，模板切换后的旧 iframe 消息不会影响当前画面。 */
export function PreviewPanel({
  version,
  values,
  pending,
  onBusyChange,
}: {
  version: Version | null;
  values: Values;
  pending: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [link, setLink] = useState("");
  const [background, setBackground] = useState("");
  const [error, setError] = useState("");
  // 已就绪的通道而不是布尔值：切换版本时 iframe 若在清空渲染前就回报就绪，false→true 会被合并成未变化，
  // 参数不再下发，预览锁到超时；每次加载的通道都不同，就绪必然触发一次下发。
  const [ready, setReady] = useState("");
  const [rendering, setRendering] = useState(false);
  const [reload, setReload] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const channel = useRef("");
  const requestId = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const blocking = useRef(false);
  const rendered = useRef(false);
  const previousBackground = useRef("");
  /** 每次加载都有超时出口；播放本身不触发锁定。 */
  function begin(lock = true) {
    window.clearTimeout(timer.current);
    blocking.current = lock;
    setRendering(lock);
    onBusyChange(lock);
    timer.current = window.setTimeout(() => {
      setError("预览加载超时，请检查服务连接后重试。");
      setRendering(false);
      blocking.current = false;
      onBusyChange(false);
    }, 20_000);
  }
  /** 完成或失败都释放操作锁，旧请求的完成消息由调用处过滤。 */
  function finish() {
    window.clearTimeout(timer.current);
    blocking.current = false;
    setRendering(false);
    onBusyChange(false);
  }
  useEffect(() => {
    if (!version) {
      onBusyChange(false);
      return;
    }
    const token = crypto.randomUUID();
    channel.current = token;
    rendered.current = false;
    setReady("");
    setError("");
    begin();
    function receive(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== token
      )
        return;
      if (event.data.type === "imv-preview-ready") {
        setReady(token);
        setError("");
      } else if (
        event.data.type === "imv-preview-rendered" &&
        event.data.requestId === requestId.current
      ) {
        rendered.current = true;
        finish();
      } else if (
        event.data.type === "imv-preview-error" &&
        (event.data.requestId === undefined ||
          event.data.requestId === requestId.current)
      ) {
        finish();
        setError(
          typeof event.data.message === "string"
            ? event.data.message.slice(0, 160)
            : "预览暂不可用。",
        );
      }
    }
    window.addEventListener("message", receive);
    if (frame.current)
      frame.current.src =
        apiUrl(`/versions/${encodeURIComponent(version.id)}/preview`) +
        "#" +
        token;
    return () => {
      window.clearTimeout(timer.current);
      onBusyChange(false);
      window.removeEventListener("message", receive);
    };
  }, [version?.id, reload, onBusyChange]);
  useEffect(() => {
    if (ready && ready === channel.current) {
      // 参数草稿更新不遮挡画面或锁控件；首帧与背景加载仍保持原有互斥。
      begin(
        blocking.current ||
          !rendered.current ||
          background !== previousBackground.current,
      );
      previousBackground.current = background;
      setError("");
      frame.current?.contentWindow?.postMessage(
        {
          type: "imv-preview-update",
          channel: channel.current,
          requestId: ++requestId.current,
          values,
          background,
        },
        "*",
      );
    }
  }, [values, background, ready]);
  /** 背景变更只进入隔离播放器，不写入模板任务。 */
  function load() {
    if (pending || rendering) return;
    try {
      setBackground(backgroundUrl(link));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "视频链接无效");
    }
  }
  const c = version?.spec.composition ?? { width: 1080, height: 1920, fps: 30 };
  const canvasStyle: CSSProperties = { aspectRatio: `${c.width} / ${c.height}`, width: `min(100cqw, calc(100cqh * ${c.width / c.height}))` };
  return (
    <section aria-label="实时预览" className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 text-[13px] font-medium">
        <Film className="size-4" /> 预览
        {version && <span className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] text-brand">V{version.number}</span>}
        <span className="ml-auto font-mono text-[10px] font-normal text-fg-subtle">{c.width} × {c.height} · {c.fps} fps</span>
      </header>
      <div className="relative min-h-0 flex-1 bg-[radial-gradient(var(--color-line-strong)_1px,transparent_1px)] bg-size-[18px_18px]">
        <div className="absolute inset-5 flex items-center justify-center [container-type:size]">
          <div aria-label="字效画布" className="relative overflow-hidden rounded-xl border border-line-strong bg-surface/70 shadow-pop" style={canvasStyle}>
            {version ? <iframe ref={frame} title="Remotion 字效播放器" sandbox="allow-scripts" allow="autoplay; fullscreen" allowFullScreen referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full border-0" /> :
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <Film className="mb-3 size-7 text-brand/60" />
                <p className="text-[13px] font-medium">你的字效将在这里呈现</p>
                <p className="mt-2 text-xs leading-relaxed text-fg-subtle">描述想法，生成后在这里播放、调参并查看效果</p>
              </div>}
            {rendering && !error && <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/90 text-xs text-fg-muted"><Spinner />正在渲染预览…</div>}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-line bg-surface p-3">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); load(); }}>
          <Input aria-label="背景视频直链" placeholder="背景视频直链（可选）" value={link} disabled={pending || rendering} onChange={(event) => setLink(event.target.value)} className="h-8 min-w-0 text-xs" />
          <Button type="submit" size="sm" variant="outline" disabled={pending || rendering}>加载</Button>
          {background && <Button type="button" size="sm" variant="ghost" disabled={pending || rendering} onClick={() => { setBackground(""); setLink(""); }}>清除背景</Button>}
        </form>
        {error && <div className="mt-2 flex items-center justify-between gap-2"><p role="alert" className="text-xs text-danger">{error}</p>{version && <Button variant="ghost" size="sm" disabled={pending || rendering} onClick={() => setReload(reload + 1)}><RotateCcw />重试预览</Button>}</div>}
      </div>
    </section>
  );
}
