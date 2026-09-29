// ============= Full file contents =============

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGameState } from "@/hooks/useGameState";
import { useStartCountdown } from "@/components/game/StartCountdown";
import { WinnerBanner } from "@/components/game/WinnerBanner";
import { heartbeat, joinRoom, submitAnswer } from "@/lib/game.functions";

export const Route = createFileRoute("/play/$code")({
  head: () => ({
    meta: [
      { title: "Yarışmaya Katıl — Halat Yarışı" },
      { name: "description", content: "Takımına katıl, soruları cevapla ve halatı kendine çek." },
      { property: "og:title", content: "Yarışmaya Katıl — Halat Yarışı" },
      { property: "og:description", content: "Telefonundan cevapla, halatı takımına çek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayerScreen,
});

const LETTERS = ["A", "B", "C", "D"] as const;

function PlayerScreen() {
  const { code } = Route.useParams();
  const storageKey = `halat-player:${code}`;
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPlayerId(localStorage.getItem(storageKey));
    setHydrated(true);
  }, [storageKey]);

  if (!hydrated) return <Shell>Yükleniyor...</Shell>;
  if (!playerId)
    return (
      <JoinForm
        code={code}
        onJoined={(id) => {
          localStorage.setItem(storageKey, id);
          setPlayerId(id);
        }}
      />
    );
  return <GameView code={code} playerId={playerId} />;
}

function Shell({ children, full }: { children: React.ReactNode; full?: boolean }) {
  if (full) {
    // Yarışma alanı: kart yok, tam ekrana sabit — sayfa kaydırılmaz,
    // her şey tek ekrana sığar.
    return (
      <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
        {children}
      </main>
    );
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-[var(--radius)] bg-panel p-6 shadow-[var(--shadow-panel)]">
        {children}
      </div>
    </main>
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (id: string) => void }) {
  const join = useServerFn(joinRoom);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    // Tarayıcı tam ekranı yalnızca kullanıcı hareketiyle açılabilir; katılırken iste.
    try {
      if (typeof document !== "undefined" && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* tam ekran reddedilirse oyun normal devam eder */
    }
    setLoading(true);
    setError(null);
    try {
      const res = await join({ data: { code, name } });
      onJoined(res.playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Katılamadınız");
      setLoading(false);
    }
  };

  return (
    <Shell>
      <p className="text-center text-xs font-semibold tracking-[0.3em] text-muted-foreground">
        ODA {code}
      </p>
      <h1 className="mt-2 text-center text-3xl font-extrabold text-foreground">HALAT YARIŞI</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Adını yaz, takımın otomatik olarak atanır.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Adın"
        className="mt-6 w-full rounded-2xl border-2 border-border bg-background px-5 py-4 text-center text-lg font-bold outline-none focus:border-team1"
      />
      <button
        onClick={handle}
        disabled={loading || name.trim().length < 2}
        className="mt-4 w-full rounded-full bg-foreground px-6 py-4 text-lg font-bold text-background disabled:opacity-50"
      >
        {loading ? "KATILIYOR..." : "YARIŞMAYA KATIL"}
      </button>
      {error && <p className="mt-4 text-center text-sm font-semibold text-destructive">{error}</p>}
    </Shell>
  );
}

function GameView({ code, playerId }: { code: string; playerId: string }) {
  const { data, isError, refetch } = useGameState(code, playerId);
  const answer = useServerFn(submitAnswer);
  const ping = useServerFn(heartbeat);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // Her cevap gönderiminde benzersiz bir "flaş" üretilir; aynı yanlış şıkka
  // üst üste basılsa bile YANLIŞ her seferinde yeniden görünüp kaybolur.
  const [flash, setFlash] = useState<{ seq: number; answer: string; isCorrect: boolean } | null>(
    null,
  );
  const [flashVisible, setFlashVisible] = useState(false);
  // Seçilen şıkkı sunucu yanıtı gelmeden hemen işaretle
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const questionIndex = data?.question?.index;
  const countdown = useStartCountdown(data?.status, questionIndex);

  useEffect(() => {
    setTyped("");
    setFlash(null);
    setFlashVisible(false);
    setOptimistic(null);
  }, [questionIndex]);

  // Flaş kısa süre görünüp kendiliğinden kaybolur; işaret de onunla gider
  useEffect(() => {
    if (!flash) return undefined;
    setFlashVisible(true);
    const id = setTimeout(() => {
      setFlashVisible(false);
      if (!flash.isCorrect) setOptimistic(null);
    }, 900);
    return () => clearTimeout(id);
  }, [flash]);

  // Doğru cevap kalıcı olarak kilitli kalır (sunucudan da gelse)
  const correctAnswer =
    data?.me?.isCorrect === true
      ? data.me.answer
      : flash?.isCorrect === true
        ? flash.answer
        : null;

  useEffect(() => {
    const id = setInterval(() => void ping({ data: { playerId } }), 15000);
    return () => clearInterval(id);
  }, [ping, playerId]);

  const q = data?.question ?? null;
  const me = data?.players.find((p) => p.id === playerId);

  if (isError && !data)
    return (
      <Shell>
        <p className="text-center font-semibold text-foreground">Bağlantı yeniden kuruluyor...</p>
        <button
          onClick={() => void refetch()}
          className="mt-4 w-full rounded-full bg-foreground py-3 font-bold text-background"
        >
          Tekrar dene
        </button>
      </Shell>
    );

  if (!data) return <Shell>Yükleniyor...</Shell>;

  const teamLabel = me ? `TAKIM ${me.team}` : "TAKIM";
  const teamColor = me?.team === 1 ? "bg-team1" : "bg-team2";

  if (data.status === "FINISHED") {
    const iWon =
      (data.winner === "TEAM1" && me?.team === 1) || (data.winner === "TEAM2" && me?.team === 2);
    return (
      <Shell>
        <WinnerBanner winner={data.winner} players={data.players} compact />
        {data.winner !== "TIE" && (
          <p className="text-center text-2xl font-extrabold text-foreground">
            {iWon ? "SEN KAZANDIN! 🎉" : "Bir dahaki sefere! 💪"}
          </p>
        )}
        <p className="mt-3 text-center text-sm font-semibold text-muted-foreground">
          Halat konumu: {data.ropePosition}
        </p>
      </Shell>
    );
  }

  if (data.status === "WAITING" || data.status === "READY") {
    return (
      <Shell>
        <div className={`rounded-2xl ${teamColor} px-4 py-2 text-center font-bold text-panel`}>
          {teamLabel}
        </div>
        <p className="mt-6 text-center text-lg font-bold text-foreground">
          {data.players.length < 2 ? "Diğer oyuncu bekleniyor..." : "İKİ OYUNCU HAZIR!"}
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Öğretmen oyunu başlattığında sorular burada görünecek.
        </p>
        {typeof document !== "undefined" && !document.fullscreenElement && (
          <button
            onClick={() => {
              void document.documentElement.requestFullscreen().catch(() => {});
            }}
            className="mt-5 w-full rounded-full border-2 border-border px-6 py-3 text-sm font-bold text-foreground hover:bg-muted"
          >
            TAM EKRAN YAP
          </button>
        )}
      </Shell>
    );
  }

  const canAnswer = data.status === "PLAYING" && !data.resolved && correctAnswer === null;

  // Uzun şıklarda yazı otomatik küçülür ki her şey kaydırmasız tek ekrana sığsın
  const longestOpt = Math.max(0, ...LETTERS.map((l) => q?.options[l]?.trim().length ?? 0));
  const optTextCls = longestOpt > 90 ? "text-sm" : longestOpt > 45 ? "text-base" : "text-lg";
  const optMinH = longestOpt > 90 ? "min-h-[3rem]" : "min-h-[3.5rem]";

  return (
    <Shell full>
      {countdown}
      <PreloadImage src={data.nextImageUrl} />
      <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-3">
        <div className={`rounded-full ${teamColor} px-4 py-1.5 text-sm font-bold text-panel`}>
          {teamLabel}
        </div>
        {data.status === "PAUSED" && (
          <div className="text-sm font-bold text-muted-foreground">DURAKLATILDI</div>
        )}
      </div>

      {q && (
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          {/* Soru + görsel: kaydırma yok — yazı ne kadar uzun olursa olsun
              otomatik küçülüp tek ekrana sığar (Kahoot gibi) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-1">
            <p className="mt-2 shrink-0 text-[0.65rem] font-semibold tracking-[0.2em] text-muted-foreground sm:text-xs">
              SORU {q.index} / {q.total} • {q.category.toUpperCase()}
            </p>
            <FitQuestion text={q.question} hasImage={!!q.imageUrl} />

            {q.imageUrl && (
              <div className="mt-2 flex min-h-[3.5rem] w-full flex-[1.2] items-center justify-center overflow-hidden rounded-2xl border-2 border-border bg-panel shadow-[var(--shadow-panel)]">
                <QuestionImage key={q.imageUrl} src={q.imageUrl} />
              </div>
            )}
          </div>

          {/* Cevap alanı: ekranda her zaman görünür, kaydırma gerekmez */}
          <div className="shrink-0">
            {q.type === "fill" ? (
              <form
                className="mt-2 grid gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!typed.trim()) return;
                  setSending("fill");
                  setError(null);
                  try {
                    const res = await answer({ data: { code, playerId, answer: typed } });
                    setFlash({ seq: Date.now(), answer: typed, isCorrect: res.isCorrect });
                    if (!res.isCorrect) setTyped("");
                    void refetch();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Gönderilemedi");
                  } finally {
                    setSending(null);
                  }
                }}
              >
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  maxLength={200}
                  placeholder="Cevabını yaz..."
                  aria-label="Cevabın"
                  disabled={!canAnswer}
                  className="rounded-2xl border-2 border-border bg-background px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-foreground"
                />
                <button
                  type="submit"
                  disabled={!canAnswer || !!sending || !typed.trim()}
                  className="rounded-full bg-foreground py-3 font-bold text-background disabled:opacity-60"
                >
                  {sending ? "GÖNDERİLİYOR..." : "GÖNDER"}
                </button>
              </form>
            ) : (
              <div className="mt-3 grid gap-2.5">
                {LETTERS.filter((letter) => q.options[letter]?.trim()).map((letter) => {
                  // Yanlış cevapta seçim flaşla birlikte hemen kalkar;
                  // yalnızca doğru cevap işaretli kalır
                  const chosen =
                    sending === letter || optimistic === letter || correctAnswer === letter;
                  return (
                    <button
                      key={letter}
                      disabled={!canAnswer || !!sending}
                      onClick={async () => {
                        setSending(letter);
                        setOptimistic(letter);
                        setError(null);
                        try {
                          const res = await answer({ data: { code, playerId, answer: letter } });
                          setFlash({ seq: Date.now(), answer: letter, isCorrect: res.isCorrect });
                          void refetch();
                        } catch (e) {
                          setOptimistic(null);
                          setError(e instanceof Error ? e.message : "Gönderilemedi");
                        } finally {
                          setSending(null);
                        }
                      }}
                      className={`flex ${optMinH} w-full touch-manipulation select-none items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left ${optTextCls} font-bold leading-tight transition-transform active:scale-[0.98] disabled:opacity-60 ${
                        chosen ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground"
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-extrabold text-foreground">
                        {letter}
                      </span>
                      <span className="min-w-0 flex-1 break-words">{q.options[letter]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* DOĞRU/YANLIŞ bilgisi ekranın altında, şıkların hemen altında gösterilir.
                Sabit yükseklikli alan: mesaj gelip gidince yerleşim oynamaz.
                Her cevapta (aynı yanlış şıkka tekrar basılsa bile) yeniden görünür. */}
            <div className="mt-2 flex h-12 items-start justify-center" aria-live="polite">
              {correctAnswer !== null ? (
                <p className="w-full max-w-sm rounded-2xl bg-team1 px-4 py-2 text-center text-xl font-extrabold text-panel shadow-[var(--shadow-panel)]">
                  DOĞRU! ✅
                </p>
              ) : (
                flash &&
                !flash.isCorrect &&
                flashVisible && (
                  <p
                    key={flash.seq}
                    className="w-full max-w-sm rounded-2xl bg-destructive px-4 py-2 text-center text-xl font-extrabold text-panel shadow-[var(--shadow-panel)]"
                  >
                    YANLIŞ! ❌
                  </p>
                )
              )}
            </div>
            {error && (
              <p className="mt-2 text-center text-sm font-semibold text-destructive">{error}</p>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

// Soru yazısı Kahoot gibi: alan ne kadar olursa olsun yazı otomatik küçülüp
// tamamen içine sığar — telefonda kaydırmaya hiç gerek kalmaz.
function FitQuestion({ text, hasImage }: { text: string; hasImage: boolean }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const pRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const area = areaRef.current;
      const p = pRef.current;
      if (!area || !p) return;
      // Görsel varsa yazıya alanın ~%55'i, yoksa tamamı ayrılır
      const maxH = Math.max(48, hasImage ? area.clientHeight * 0.55 : area.clientHeight);
      let size = 30;
      let guard = 0;
      while (guard++ < 60) {
        p.style.fontSize = `${size}px`;
        if (p.scrollHeight <= maxH || size <= 11) break;
        size -= 1;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text, hasImage]);

  return (
    <div
      ref={areaRef}
      className="mt-1 flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
    >
      <p
        ref={pRef}
        className="w-full text-center font-extrabold leading-snug text-foreground"
        style={{ fontSize: 30 }}
      >
        {text}
      </p>
    </div>
  );
}

function QuestionImage({ src }: { src: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="p-4 text-sm font-semibold text-muted-foreground">Fotoğraf yüklenemedi</p>;
  }
  return (
    <img
      src={attempt ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src}
      alt="Soru görseli"
      loading="eager"
      decoding="async"
      className="max-h-full w-full object-contain"
      style={{ maxHeight: "30vh" }}
      onError={() => {
        if (attempt < 3) setTimeout(() => setAttempt((a) => a + 1), 500);
        else setFailed(true);
      }}
    />
  );
}

function PreloadImage({ src }: { src: string | null }) {
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.src = src;
  }, [src]);
  return null;
}
