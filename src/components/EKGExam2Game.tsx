"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { Shuffle, Clock, BookOpenCheck, BarChart3, Play, RotateCcw } from "lucide-react";

type StripKind =
  | "sinus"
  | "sinus_brady"
  | "sinus_tachy"
  | "aflutter"
  | "afib"
  | "sinus_pac"
  | "psvt"
  | "junctional"
  | "firstdeg"
  | "stemi_inferior"
  | "nstemi";

type Question = {
  id: string;
  label: string;
  type: "strip";
  stripKind: StripKind;
  options: string[];
  answer: number;
  rationale: {
    recognition: string;
    nursing: string;
    pharm: string;
  };
  explainers?: string[];
};

type Point = [number, number];

type BeatOptions = {
  amp?: number;
  pr?: number;
  qrs?: number;
  stElevation?: number;
  tPolarity?: number;
};

const SMALL_BOX = 5; // pixels per 1 mm
const PX_PER_SEC = SMALL_BOX * 25; // 25 mm/s paper speed
const STRIP_SECONDS = 6;
const STRIP_WIDTH = PX_PER_SEC * STRIP_SECONDS;

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

function Grid({ w = STRIP_WIDTH, h = 180 }: { w?: number; h?: number }) {
  const lines: JSX.Element[] = [];
  const small = SMALL_BOX;
  for (let x = 0; x <= w; x += small) {
    const thick = x % (small * 5) === 0;
    lines.push(
      <line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={h}
        strokeWidth={thick ? 1.2 : 0.4}
        strokeOpacity={thick ? 0.5 : 0.25}
        stroke="currentColor"
      />
    );
  }
  for (let y = 0; y <= h; y += small) {
    const thick = y % (small * 5) === 0;
    lines.push(
      <line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={w}
        y2={y}
        strokeWidth={thick ? 1.2 : 0.4}
        strokeOpacity={thick ? 0.5 : 0.25}
        stroke="currentColor"
      />
    );
  }
  return <g opacity={0.6}>{lines}</g>;
}

function genNormalBeat(x0: number, pxPerSec: number, options: BeatOptions = {}): Point[] {
  const { amp = 22, pr = 0.16, qrs = 0.08, stElevation = 0, tPolarity = 1 } = options;
  const points: Point[] = [];
  const baseline = 90;

  // P wave (~0.08 s)
  const pDuration = 0.08 * pxPerSec;
  for (let i = 0; i < pDuration; i++) {
    const t = i / pDuration;
    const y = baseline - Math.sin(t * Math.PI) * (amp * 0.25);
    points.push([x0 + i, y]);
  }

  // PR segment until QRS
  const prSegment = Math.max(0, pr - 0.08) * pxPerSec;
  for (let i = 0; i < prSegment; i++) {
    points.push([x0 + pDuration + i, baseline]);
  }

  let cursor = x0 + pDuration + prSegment;

  // QRS (~0.08 s)
  const qrsDuration = qrs * pxPerSec;
  for (let i = 0; i < qrsDuration; i++) {
    const t = i / qrsDuration;
    const shape = t < 0.15 ? -0.3 : t < 0.5 ? 1.2 : t < 0.85 ? -0.4 : 0;
    const y = baseline - shape * amp;
    points.push([cursor + i, y]);
  }
  cursor += qrsDuration;

  // ST segment
  const stSegment = 0.08 * pxPerSec;
  for (let i = 0; i < stSegment; i++) {
    points.push([cursor + i, baseline - stElevation]);
  }
  cursor += stSegment;

  // T wave (~0.16 s)
  const tDuration = 0.16 * pxPerSec;
  for (let i = 0; i < tDuration; i++) {
    const t = i / tDuration;
    const y = baseline - Math.sin(t * Math.PI) * (amp * 0.4) * tPolarity;
    points.push([cursor + i, y]);
  }

  // Return to baseline
  const returnDuration = 0.04 * pxPerSec;
  for (let i = 0; i < returnDuration; i++) {
    points.push([cursor + tDuration + i, baseline]);
  }

  return points;
}

function genAflutter(width: number, amp = 18, rate = 300): Point[] {
  const baseline = 90;
  const points: Point[] = [];
  const flutterPeriod = 60 / rate; // seconds per flutter wave
  const pixelsPerWave = width * flutterPeriod;

  for (let i = 0; i < width; i++) {
    const wavePosition = (i % pixelsPerWave) / pixelsPerWave;
    const y = baseline - Math.abs(wavePosition - 0.5) * 2 * amp * 0.5;
    points.push([i, y]);
  }

  for (let start = 0; start < width; start += pixelsPerWave * 4) {
    for (let k = 0; k < 0.08 * width; k++) {
      const index = Math.min(points.length - 1, Math.floor(start + k));
      const y = 90 - (k < 0.02 * width ? -4 : k < 0.04 * width ? 20 : -6);
      points[index][1] = y;
    }
  }

  return points;
}

function genAfib(width: number): Point[] {
  const baseline = 90;
  const points: Point[] = [];
  let y = baseline;
  for (let i = 0; i < width; i++) {
    y += rand(-1.2, 1.2);
    points.push([i, y]);
  }

  let cursor = 0;
  while (cursor < width) {
    const rr = rand(0.5, 1.1) * width * 0.2;
    for (let k = 0; k < 0.06 * width && cursor + k < width; k++) {
      const index = Math.floor(cursor + k);
      const yPoint = 90 - (k < 0.02 * width ? -4 : k < 0.03 * width ? 18 : -6);
      points[index][1] = yPoint;
    }
    cursor += rr;
  }

  return points;
}

function toPath(points: Point[]) {
  return points.map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x},${y}`).join(" ");
}

function genSinusStrip(bpm: number, options: BeatOptions = {}): Point[] {
  const points: Point[] = [];
  const rr = 60 / bpm;
  let cursor = 10;
  while (cursor < STRIP_WIDTH - 10) {
    const beat = genNormalBeat(cursor, PX_PER_SEC, options);
    points.push(...beat);
    cursor += rr * PX_PER_SEC;
  }
  return points;
}

function cropPoints(points: Point[], start: number, end: number): Point[] {
  return points
    .filter(([x]) => x >= start && x <= end)
    .map(([x, y]) => [x - start, y]);
}

function ZoomStrip({ pts, seconds = 1.2, label = "Zoom" }: { pts: Point[]; seconds?: number; label?: string }) {
  const viewWidth = Math.max(400, seconds * PX_PER_SEC * 1.4);
  const viewHeight = 180;

  const cropped = useMemo(() => {
    const start = STRIP_WIDTH * 0.32;
    const end = start + seconds * PX_PER_SEC;
    return cropPoints(pts, start, end);
  }, [pts, seconds]);

  const path = useMemo(() => toPath(cropped), [cropped]);

  return (
    <div className="mt-2">
      <div className="text-xs mb-1 opacity-70">
        {label}: ~{seconds.toFixed(1)} s window (count small boxes at 25 mm/s)
      </div>
      <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="w-full h-auto text-pink-500">
        <Grid w={viewWidth} h={viewHeight} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1} />
      </svg>
    </div>
  );
}

const QUESTIONS: Question[] = [
  {
    id: "nsr",
    label: "Normal Sinus Rhythm (~60-100 bpm)",
    type: "strip",
    stripKind: "sinus",
    options: ["Normal sinus rhythm", "Sinus bradycardia", "Sinus tachycardia", "First-degree AV block"],
    answer: 0,
    rationale: {
      recognition: "Regular rhythm with upright P before every QRS, PR 0.12-0.20 s, rate 60-100 bpm.",
      nursing: "Within normal limits; correlate with patient presentation.",
      pharm: "No rhythm-specific therapy indicated."
    }
  },
  {
    id: "sbrady",
    label: "Sinus Bradycardia (<60 bpm)",
    type: "strip",
    stripKind: "sinus_brady",
    options: ["Sinus bradycardia", "Normal sinus rhythm", "Junctional rhythm", "First-degree AV block"],
    answer: 0,
    rationale: {
      recognition: "Regular rhythm with sinus P waves and normal PR; rate below 60 bpm.",
      nursing: "Assess perfusion; if unstable, prepare for atropine and pacing per ACLS order set.",
      pharm: "Atropine for symptomatic bradycardia as ordered; review AV-nodal medications."
    }
  },
  {
    id: "stachy",
    label: "Sinus Tachycardia (>100 bpm)",
    type: "strip",
    stripKind: "sinus_tachy",
    options: ["Sinus tachycardia", "Paroxysmal SVT", "Atrial fibrillation", "Atrial flutter"],
    answer: 0,
    rationale: {
      recognition: "Regular rhythm with sinus P waves and normal PR; rate above 100 bpm.",
      nursing: "Identify and treat the underlying trigger such as fever, hypovolemia, pain, or hypoxia.",
      pharm: "Treat the cause first; avoid AV-nodal blockers unless specifically directed."
    }
  },
  {
    id: "aflutter",
    label: "Atrial Flutter with 4:1 block",
    type: "strip",
    stripKind: "aflutter",
    options: ["Atrial flutter", "Atrial fibrillation", "Paroxysmal SVT", "Junctional rhythm"],
    answer: 0,
    rationale: {
      recognition: "Sawtooth flutter waves, best in inferior leads, with regular ventricular response near 75 bpm.",
      nursing: "Focus on rate control and anticoagulation review; cardiovert promptly if unstable.",
      pharm: "Beta-blocker or diltiazem for rate control; antiarrhythmics per provider when indicated."
    }
  },
  {
    id: "afib",
    label: "Atrial Fibrillation (irregularly irregular)",
    type: "strip",
    stripKind: "afib",
    options: ["Atrial fibrillation", "Atrial flutter", "Paroxysmal SVT", "First-degree AV block"],
    answer: 0,
    rationale: {
      recognition: "No discrete P waves, fibrillatory baseline, and irregularly irregular RR intervals.",
      nursing: "Assess perfusion and stroke risk; rate control and anticoagulation review are priorities.",
      pharm: "Anticoagulation per risk score; amiodarone or rhythm strategy when appropriate."
    }
  },
  {
    id: "pac",
    label: "PACs on underlying sinus rhythm",
    type: "strip",
    stripKind: "sinus_pac",
    options: ["Premature atrial contractions", "Paroxysmal SVT", "Junctional rhythm", "Normal sinus rhythm"],
    answer: 0,
    rationale: {
      recognition: "Early ectopic P wave with abnormal morphology followed by narrow QRS and non-compensatory pause.",
      nursing: "Usually benign; look for triggers such as stimulants, stress, or electrolyte imbalance.",
      pharm: "Beta-blocker may be used if symptomatic and frequent per provider order."
    }
  },
  {
    id: "psvt",
    label: "Paroxysmal SVT (regular narrow-complex tachycardia)",
    type: "strip",
    stripKind: "psvt",
    options: ["Paroxysmal SVT", "Sinus tachycardia", "Atrial flutter", "Atrial fibrillation"],
    answer: 0,
    rationale: {
      recognition: "Regular narrow-complex tachycardia 150-220 bpm with absent or retrograde P waves.",
      nursing: "Attempt vagal maneuvers; prepare adenosine if stable or synchronized cardioversion if unstable.",
      pharm: "Adenosine is first-line for stable reentry SVT; consider beta-blocker or calcium channel blocker."
    }
  },
  {
    id: "junctional",
    label: "Junctional rhythm (~40-60 bpm)",
    type: "strip",
    stripKind: "junctional",
    options: ["Junctional rhythm", "Sinus bradycardia", "Paroxysmal SVT", "Atrial fibrillation"],
    answer: 0,
    rationale: {
      recognition: "Narrow QRS without visible P waves or with inverted P waves; rate 40-60 bpm.",
      nursing: "Assess for digoxin toxicity or ischemia; treat symptomatic bradycardia per ACLS guidance.",
      pharm: "Hold AV-nodal blockers if causal; atropine may be ordered if patient is symptomatic."
    }
  },
  {
    id: "first_deg_avb",
    label: "First-degree AV block (PR > 0.20 s)",
    type: "strip",
    stripKind: "firstdeg",
    options: ["First-degree AV block", "Normal sinus rhythm", "Junctional rhythm", "Paroxysmal SVT"],
    answer: 0,
    rationale: {
      recognition: "Each P wave conducts with a prolonged but constant PR interval greater than 0.20 s.",
      nursing: "Usually asymptomatic; continue monitoring and review AV-nodal medications and electrolytes.",
      pharm: "Adjust beta-blocker, calcium channel blocker, or digoxin if PR becomes markedly prolonged."
    }
  },
  {
    id: "stemi",
    label: "STEMI (contiguous ST elevation)",
    type: "strip",
    stripKind: "stemi_inferior",
    options: ["STEMI", "NSTEMI or ischemia", "Atrial flutter", "Atrial fibrillation"],
    answer: 0,
    rationale: {
      recognition: "New ST elevation in two or more contiguous leads with evolving T wave changes and possible reciprocal depression.",
      nursing: "Activate the cath lab and follow the facility's STEMI pathway; avoid nitrates if right ventricular infarct suspected.",
      pharm: "Dual antiplatelet therapy, anticoagulation, high-intensity statin, and beta-blocker when appropriate."
    }
  },
  {
    id: "nstemi",
    label: "NSTEMI or ischemia (ST depression / T inversion)",
    type: "strip",
    stripKind: "nstemi",
    options: ["NSTEMI or ischemia", "STEMI", "Atrial fibrillation", "First-degree AV block"],
    answer: 0,
    rationale: {
      recognition: "Horizontal or downsloping ST depression and/or T wave inversion in contiguous leads.",
      nursing: "Provide anti-ischemic therapy, obtain serial troponins, and prepare for early invasive strategy when indicated.",
      pharm: "Dual antiplatelet therapy and anticoagulation per ACS protocol."
    }
  }
];

function buildStrip(kind: StripKind): Point[] {
  if (kind === "sinus") {
    return genSinusStrip(75);
  }
  if (kind === "sinus_brady") {
    return genSinusStrip(48);
  }
  if (kind === "sinus_tachy") {
    return genSinusStrip(120);
  }
  if (kind === "aflutter") {
    return genAflutter(STRIP_WIDTH);
  }
  if (kind === "afib") {
    return genAfib(STRIP_WIDTH);
  }
  if (kind === "sinus_pac") {
    const points: Point[] = [];
    let cursor = 10;
    let beatIndex = 0;
    const rr = 0.8 * PX_PER_SEC;
    while (cursor < STRIP_WIDTH - 10) {
      const earlyOffset = beatIndex === 2 ? Math.max(-cursor + 2, -0.3 * PX_PER_SEC) : 0;
      const beat = genNormalBeat(cursor + earlyOffset, PX_PER_SEC, { pr: 0.14 });
      points.push(...beat);
      cursor += rr;
      beatIndex += 1;
    }
    return points;
  }
  if (kind === "psvt") {
    const points: Point[] = [];
    let cursor = 10;
    while (cursor < STRIP_WIDTH - 10) {
      const beat = genNormalBeat(cursor, PX_PER_SEC * 0.7, { amp: 18, pr: 0.1, qrs: 0.06 });
      points.push(...beat);
      cursor += 0.4 * PX_PER_SEC;
    }
    return points;
  }
  if (kind === "junctional") {
    const points: Point[] = [];
    let cursor = 10;
    while (cursor < STRIP_WIDTH - 10) {
      const beat = genNormalBeat(cursor, PX_PER_SEC, { amp: 16, pr: 0.06, tPolarity: -1 });
      points.push(...beat);
      cursor += 1.0 * PX_PER_SEC;
    }
    return points;
  }
  if (kind === "firstdeg") {
    const points: Point[] = [];
    let cursor = 10;
    while (cursor < STRIP_WIDTH - 10) {
      const beat = genNormalBeat(cursor, PX_PER_SEC, { pr: 0.26 });
      points.push(...beat);
      cursor += 0.8 * PX_PER_SEC;
    }
    return points;
  }
  if (kind === "stemi_inferior") {
    const points: Point[] = [];
    let cursor = 10;
    while (cursor < STRIP_WIDTH - 10) {
      const beat = genNormalBeat(cursor, PX_PER_SEC, { stElevation: -6 });
      points.push(...beat);
      cursor += 0.8 * PX_PER_SEC;
    }
    return points;
  }
  if (kind === "nstemi") {
    const points: Point[] = [];
    let cursor = 10;
    while (cursor < STRIP_WIDTH - 10) {
      const beat = genNormalBeat(cursor, PX_PER_SEC, { stElevation: 3, tPolarity: -1 });
      points.push(...beat);
      cursor += 0.8 * PX_PER_SEC;
    }
    return points;
  }
  return genSinusStrip(75);
}

function Strip({ kind }: { kind: StripKind }) {
  const points = useMemo(() => buildStrip(kind), [kind]);

  return (
    <div>
      <svg viewBox={`0 0 ${STRIP_WIDTH} 180`} className="w-full h-auto text-pink-500">
        <Grid />
        <path d={toPath(points)} fill="none" stroke="currentColor" strokeWidth={1.4} />
        <text x={STRIP_WIDTH - 8} y={172} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
          6 s
        </text>
      </svg>
      <ZoomStrip pts={points} seconds={1.2} label="Zoomed view" />
    </div>
  );
}

function useQuiz(engine: Question[]) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);

  const total = engine.length;
  const question = engine[index] ?? engine[0];

  const select = (option: number) => {
    if (answered != null) return;
    const isCorrect = option === question.answer;
    setAnswered(option);
    if (isCorrect) {
      setCorrect((value) => value + 1);
    }
  };

  const next = () => {
    if (index + 1 < total) {
      setIndex((value) => value + 1);
      setAnswered(null);
    }
  };

  const reset = () => {
    setIndex(0);
    setCorrect(0);
    setAnswered(null);
  };

  useEffect(() => {
    setIndex(0);
    setCorrect(0);
    setAnswered(null);
  }, [engine]);

  return { index, question, total, select, next, reset, correct, answered };
}

function Header({ mode, setMode, onReset }: { mode: string; setMode: (value: string) => void; onReset: () => void }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-2xl font-semibold">
          EKG Strip Quiz
        </motion.div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="px-2 py-1 text-xs rounded-full bg-gray-100">Exam 2 - Modules 3-4</div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-sm">
              Focused on Module 4 atrial dysrhythmias plus ACS and MI strip recognition. Module 3 hematology content is excluded.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-2">
        <Tabs value={mode} onValueChange={setMode} className="hidden md:block">
          <TabsList>
            <TabsTrigger value="practice">
              <Shuffle className="mr-1 h-4 w-4" /> Practice
            </TabsTrigger>
            <TabsTrigger value="timed">
              <Clock className="mr-1 h-4 w-4" /> Timed 10
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2 md:hidden">
          <Button variant={mode === "practice" ? "default" : "outline"} onClick={() => setMode("practice")}>
            <Shuffle className="mr-1 h-4 w-4" /> Practice
          </Button>
          <Button variant={mode === "timed" ? "default" : "outline"} onClick={() => setMode("timed")}>
            <Clock className="mr-1 h-4 w-4" /> Timed
          </Button>
        </div>
        <Button variant="secondary" onClick={onReset}>
          <RotateCcw className="mr-1 h-4 w-4" /> Reset
        </Button>
      </div>
    </div>
  );
}

function Rationale({
  data,
  show,
  pickedLabel,
  correctLabel,
  whyNot
}: {
  data: Question["rationale"];
  show: boolean;
  pickedLabel: string;
  correctLabel: string;
  whyNot: string[] | null;
}) {
  if (!show) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3 md:grid-cols-3 mt-3">
      <Card className="shadow-sm md:col-span-2">
        <CardContent className="p-4">
          <div className="mb-1 font-semibold">Why the correct answer is correct</div>
          <div className="text-sm opacity-90 whitespace-pre-wrap">
            {data.recognition}
            {"\n\n"}Nursing priorities: {data.nursing}
            {"\n"}Pharm pearls: {data.pharm}
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="mb-1 font-semibold">Your answer vs correct</div>
          <div className="text-xs mb-2 opacity-80">
            You picked: <b>{pickedLabel || "--"}</b>
            <br />
            Correct: <b>{correctLabel}</b>
          </div>
          {whyNot && whyNot.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs">
              {whyNot.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function QuestionCard({
  question,
  index,
  total,
  onPick,
  answered
}: {
  question: Question;
  index: number;
  total: number;
  onPick: (option: number) => void;
  answered: number | null;
}) {
  const pickedLabel = answered != null ? question.options[answered] ?? "" : "";
  const correctLabel = question.options[question.answer];
  const whyNot = answered != null && answered !== question.answer && question.explainers ? question.explainers : null;

  return (
    <Card className="shadow-md">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">Question {index + 1} of {total}</div>
          <div className="flex items-center gap-2 text-sm opacity-70">
            <BookOpenCheck className="h-4 w-4" /> {question.label}
          </div>
        </div>
        {question.type === "strip" && (
          <div className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
            <Strip kind={question.stripKind} />
          </div>
        )}
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {question.options.map((option, optionIndex) => {
            const variant = answered == null
              ? "outline"
              : optionIndex === question.answer
              ? "default"
              : optionIndex === answered
              ? "destructive"
              : "outline";
            return (
              <Button
                key={optionIndex}
                variant={variant}
                className="justify-start"
                onClick={() => onPick(optionIndex)}
                disabled={answered != null}
              >
                {option}
              </Button>
            );
          })}
        </div>
        <Rationale
          data={question.rationale}
          show={answered != null}
          pickedLabel={pickedLabel}
          correctLabel={correctLabel}
          whyNot={whyNot}
        />
      </CardContent>
    </Card>
  );
}

function Stats({ correct, total }: { correct: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4" /> Performance
          </div>
          <div className="text-sm opacity-70">
            {correct}/{total} correct
          </div>
        </div>
        <Progress value={pct} />
      </CardContent>
    </Card>
  );
}

const TIMED_SECONDS = 180;

export default function EKGExam2Game() {
  const [mode, setMode] = useState("practice");
  const questionSet = useMemo(() => {
    if (mode === "timed") {
      const pool = [...QUESTIONS];
      const selection: Question[] = [];
      while (selection.length < 10 && pool.length > 0) {
        const index = Math.floor(Math.random() * pool.length);
        selection.push(pool.splice(index, 1)[0]);
      }
      return selection;
    }
    return QUESTIONS;
  }, [mode]);

  const { index, question, total, select, next, reset, correct, answered } = useQuiz(questionSet);

  const [timeLeft, setTimeLeft] = useState(TIMED_SECONDS);

  useEffect(() => {
    if (mode !== "timed") return;
    setTimeLeft(TIMED_SECONDS);
    const timer = window.setInterval(() => {
      setTimeLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== "timed") return;
    if (timeLeft === 0) {
      setMode("practice");
    }
  }, [mode, timeLeft]);

  useEffect(() => {
    if (mode === "practice") {
      setTimeLeft(TIMED_SECONDS);
    }
  }, [mode]);

  return (
    <React.Fragment>
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <Header mode={mode} setMode={setMode} onReset={reset} />

        {mode === "timed" && (
          <div className="flex items-center justify-between px-2 text-sm">
            <div className="opacity-75">Timed challenge: 10 questions</div>
            <div className="font-semibold">
              Time left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </div>
          </div>
        )}

        <QuestionCard question={question} index={index} total={total} onPick={select} answered={answered} />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Stats correct={correct} total={total} />
          <div className="flex gap-2">
            <Button onClick={reset} variant="outline">
              <RotateCcw className="mr-1 h-4 w-4" /> Restart
            </Button>
            <Button onClick={next} disabled={index + 1 >= total}>
              <Play className="mr-1 h-4 w-4" /> Next
            </Button>
          </div>
        </div>

        <div className="pt-2 text-center text-xs opacity-70">
          Educational use only. Simplified lead II renderings; always correlate clinically.
        </div>
      </div>
    </React.Fragment>
  );
}
