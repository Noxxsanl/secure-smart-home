// ---------------------------------------------------------------------------
// AI Prediction Center — in-memory mock dataset.
//
// Mirrors `shared/mock/store.ts`: a module-level singleton so mutations made by
// one action (Train Model / Run Prediction / Accept–Reject a recommendation)
// stay visible to every other page in the same dev-server session, exactly as a
// real backend + SWR revalidation would behave. No API, no database.
// ---------------------------------------------------------------------------

export type AiOverviewIconKey =
  | "model" | "accuracy" | "precision" | "recall" | "f1" | "dataset";

export type AiOverviewMetric = {
  key: AiOverviewIconKey;
  label: string;
  value: string;
  hint: string;
  /** Delta vs. the previously trained version — null for non-numeric cards. */
  delta: number | null;
};

export type AiModelHealth = "healthy" | "degraded" | "critical";
export type AiRuntimeStatus = "running" | "training" | "idle";
export type AiPredictionMode = "Auto" | "Manual";

export type AiModelStatus = {
  model: string;
  version: string;
  lastTraining: string;      // "YYYY-MM-DD HH:mm"
  predictionMode: AiPredictionMode;
  status: AiRuntimeStatus;
  trainingProgress: number;  // 0–100
  health: AiModelHealth;
  inferenceLatencyMs: number;
};

export type AiPredictionStatKey =
  | "today" | "automated" | "override" | "confidence";

export type AiPredictionStat = {
  key: AiPredictionStatKey;
  label: string;
  value: number;
  suffix?: string;
  hint: string;
};

export type AiDeviceCategory = "light" | "fan" | "door" | "other";
export type AiPredictionAction = "Executed" | "Waiting" | "Skipped";
export type AiPredictionStatus = "success" | "pending" | "failed";

export type AiPrediction = {
  id: number;
  time: string;               // "HH:mm"
  room: string;
  device: string;
  category: AiDeviceCategory;
  prediction: "Turn ON" | "Turn OFF";
  confidence: number;         // 0–100
  action: AiPredictionAction;
  status: AiPredictionStatus;
};

export type AiAccuracyPoint = {
  date: string;               // "YYYY-MM-DD"
  label: string;              // short axis label, e.g. "20/07"
  accuracy: number;           // percent
};

export type AiDistributionSlice = {
  key: AiDeviceCategory;
  label: string;
  value: number;              // percent, sums to 100
};

export type AiRecommendation = {
  id: number;
  room: string;
  device: string;
  category: AiDeviceCategory;
  action: "ON" | "OFF";
  confidence: number;
  reason: string;
};

export type AiTrainingRun = {
  id: number;
  version: string;
  accuracy: number;
  samples: number;
  durationSec: number;
  status: "completed" | "failed";
  trainedAt: string;          // "YYYY-MM-DD HH:mm"
};

export type AiFeatureImportance = {
  feature: string;
  importance: number;         // percent contribution
};

export type AiDatasetSummary = {
  training: number;
  validation: number;
  test: number;
  total: number;
  classDistribution: { on: number; off: number };
};

export type AiNotificationLevel = "success" | "info" | "warning";

export type AiNotification = {
  id: number;
  level: AiNotificationLevel;
  message: string;
  detail: string;
  time: string;               // "HH:mm" — relative-feeling, mock only
};

export type AiDashboardSnapshot = {
  overview: AiOverviewMetric[];
  modelStatus: AiModelStatus;
  predictionStats: AiPredictionStat[];
  predictions: AiPrediction[];
  accuracyTrend: AiAccuracyPoint[];
  distribution: AiDistributionSlice[];
  recommendations: AiRecommendation[];
  trainingHistory: AiTrainingRun[];
  featureImportance: AiFeatureImportance[];
  dataset: AiDatasetSummary;
  notifications: AiNotification[];
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const overview: AiOverviewMetric[] = [
  { key: "model",     label: "Model",        value: "Random Forest", hint: "200 trees · depth 12",       delta: null },
  { key: "accuracy",  label: "Accuracy",     value: "94.8%",         hint: "Trên tập test 1,926 mẫu",    delta: 0.8 },
  { key: "precision", label: "Precision",    value: "93.5%",         hint: "Tỉ lệ dự đoán ON đúng",      delta: 0.4 },
  { key: "recall",    label: "Recall",       value: "95.1%",         hint: "Tỉ lệ bắt đúng hành vi bật", delta: 1.2 },
  { key: "f1",        label: "F1 Score",     value: "94.2%",         hint: "Cân bằng precision/recall",  delta: 0.6 },
  { key: "dataset",   label: "Dataset Size", value: "12,845",        hint: "samples đã gán nhãn",        delta: 2845 },
];

const modelStatus: AiModelStatus = {
  model: "Random Forest",
  version: "v1.3",
  lastTraining: "2026-07-20 21:35",
  predictionMode: "Auto",
  status: "running",
  trainingProgress: 78,
  health: "healthy",
  inferenceLatencyMs: 42,
};

const predictionStats: AiPredictionStat[] = [
  { key: "today",      label: "Today's Predictions",   value: 235, hint: "Tổng suy luận trong 24h qua." },
  { key: "automated",  label: "Successful Automation", value: 198, hint: "Lệnh đã thực thi thành công." },
  { key: "override",   label: "Manual Override",       value: 17,  hint: "Người dùng can thiệp thủ công." },
  { key: "confidence", label: "Prediction Confidence", value: 92,  suffix: "%", hint: "Độ tin cậy trung bình." },
];

const predictions: AiPrediction[] = [
  { id: 1,  time: "18:20", room: "Living Room", device: "Ceiling Light",  category: "light", prediction: "Turn ON",  confidence: 96, action: "Executed", status: "success" },
  { id: 2,  time: "18:14", room: "Bedroom",     device: "Ceiling Fan",    category: "fan",   prediction: "Turn OFF", confidence: 88, action: "Waiting",  status: "pending" },
  { id: 3,  time: "18:05", room: "Kitchen",     device: "Exhaust Fan",    category: "fan",   prediction: "Turn ON",  confidence: 91, action: "Executed", status: "success" },
  { id: 4,  time: "17:58", room: "Front Door",  device: "Smart Lock",     category: "door",  prediction: "Turn OFF", confidence: 84, action: "Skipped",  status: "failed"  },
  { id: 5,  time: "17:46", room: "Office",      device: "Desk Light",     category: "light", prediction: "Turn ON",  confidence: 93, action: "Executed", status: "success" },
  { id: 6,  time: "17:32", room: "Garage",      device: "Garage Door",    category: "door",  prediction: "Turn OFF", confidence: 79, action: "Waiting",  status: "pending" },
  { id: 7,  time: "17:20", room: "Living Room", device: "Air Purifier",   category: "other", prediction: "Turn ON",  confidence: 90, action: "Executed", status: "success" },
  { id: 8,  time: "17:03", room: "Bathroom",    device: "Mirror Light",   category: "light", prediction: "Turn OFF", confidence: 87, action: "Executed", status: "success" },
  { id: 9,  time: "16:48", room: "Bedroom",     device: "Bedside Lamp",   category: "light", prediction: "Turn ON",  confidence: 95, action: "Executed", status: "success" },
  { id: 10, time: "16:35", room: "Kitchen",     device: "Under Cabinet",  category: "light", prediction: "Turn ON",  confidence: 82, action: "Waiting",  status: "pending" },
  { id: 11, time: "16:12", room: "Garden",      device: "Sprinkler",      category: "other", prediction: "Turn OFF", confidence: 76, action: "Skipped",  status: "failed"  },
  { id: 12, time: "15:57", room: "Living Room", device: "Standing Fan",   category: "fan",   prediction: "Turn ON",  confidence: 89, action: "Executed", status: "success" },
  { id: 13, time: "15:40", room: "Office",      device: "Window Blind",   category: "other", prediction: "Turn OFF", confidence: 85, action: "Executed", status: "success" },
  { id: 14, time: "15:22", room: "Back Door",   device: "Smart Lock",     category: "door",  prediction: "Turn OFF", confidence: 94, action: "Executed", status: "success" },
  { id: 15, time: "15:04", room: "Bedroom",     device: "Wall Fan",       category: "fan",   prediction: "Turn OFF", confidence: 81, action: "Waiting",  status: "pending" },
];

const accuracyTrend: AiAccuracyPoint[] = [
  { date: "2026-07-20", label: "20/07", accuracy: 91.4 },
  { date: "2026-07-21", label: "21/07", accuracy: 92.1 },
  { date: "2026-07-22", label: "22/07", accuracy: 91.8 },
  { date: "2026-07-23", label: "23/07", accuracy: 93.2 },
  { date: "2026-07-24", label: "24/07", accuracy: 93.9 },
  { date: "2026-07-25", label: "25/07", accuracy: 94.3 },
  { date: "2026-07-26", label: "26/07", accuracy: 94.8 },
];

const distribution: AiDistributionSlice[] = [
  { key: "light", label: "Lights", value: 45 },
  { key: "fan",   label: "Fans",   value: 30 },
  { key: "door",  label: "Doors",  value: 15 },
  { key: "other", label: "Others", value: 10 },
];

const recommendations: AiRecommendation[] = [
  { id: 1, room: "Living Room", device: "Ceiling Light", category: "light", action: "ON",  confidence: 95, reason: "Usually turned on at this time." },
  { id: 2, room: "Kitchen",     device: "Exhaust Fan",   category: "fan",   action: "OFF", confidence: 91, reason: "Temperature has decreased." },
  { id: 3, room: "Bedroom",     device: "Bedside Lamp",  category: "light", action: "OFF", confidence: 89, reason: "No motion detected." },
  { id: 4, room: "Garage",      device: "Garage Door",   category: "door",  action: "OFF", confidence: 86, reason: "Vehicle has been parked for 45 minutes." },
  { id: 5, room: "Office",      device: "Window Blind",  category: "other", action: "ON",  confidence: 83, reason: "Outdoor light sensor above threshold." },
];

const trainingHistory: AiTrainingRun[] = [
  { id: 4, version: "v1.3", accuracy: 94.8, samples: 12845, durationSec: 21, status: "completed", trainedAt: "2026-07-20 21:35" },
  { id: 3, version: "v1.2", accuracy: 94.0, samples: 10000, durationSec: 18, status: "completed", trainedAt: "2026-07-12 09:12" },
  { id: 2, version: "v1.1", accuracy: 93.0, samples: 7000,  durationSec: 16, status: "completed", trainedAt: "2026-07-03 14:40" },
  { id: 1, version: "v1.0", accuracy: 91.0, samples: 3000,  durationSec: 12, status: "completed", trainedAt: "2026-06-24 08:05" },
];

const featureImportance: AiFeatureImportance[] = [
  { feature: "Hour",            importance: 21.4 },
  { feature: "Previous Action", importance: 17.8 },
  { feature: "Motion",          importance: 15.2 },
  { feature: "Weekday",         importance: 12.6 },
  { feature: "Temperature",     importance: 10.3 },
  { feature: "Light Sensor",    importance: 8.7 },
  { feature: "Humidity",        importance: 6.1 },
  { feature: "Room",            importance: 4.6 },
  { feature: "Device Type",     importance: 3.3 },
];

const dataset: AiDatasetSummary = {
  training: 8992,
  validation: 1927,
  test: 1926,
  total: 12845,
  classDistribution: { on: 7102, off: 5743 },
};

const notifications: AiNotification[] = [
  { id: 1, level: "success", message: "Model retrained successfully.", detail: "Random Forest v1.3 đã được nạp vào runtime.", time: "21:35" },
  { id: 2, level: "success", message: "Accuracy increased.",           detail: "94.0% → 94.8% so với phiên bản v1.2.",      time: "21:36" },
  { id: 3, level: "info",    message: "New prediction available.",     detail: "5 dự đoán mới cho Living Room và Kitchen.", time: "18:20" },
  { id: 4, level: "info",    message: "Gateway synchronized.",         detail: "GW-HN-014 đã đồng bộ model mới nhất.",      time: "18:02" },
  { id: 5, level: "warning", message: "Manual override detected.",     detail: "Người dùng tắt Garden Sprinkler thủ công.", time: "16:12" },
];

// ---------------------------------------------------------------------------
// Mutable state
// ---------------------------------------------------------------------------

let _overview = [...overview];
let _modelStatus: AiModelStatus = { ...modelStatus };
let _predictionStats = predictionStats.map((s) => ({ ...s }));
let _predictions = [...predictions];
let _accuracyTrend = [...accuracyTrend];
let _recommendations = [...recommendations];
let _trainingHistory = [...trainingHistory];
let _notifications = [...notifications];

let nextPredictionId = Math.max(..._predictions.map((p) => p.id)) + 1;
let nextTrainingId = Math.max(..._trainingHistory.map((t) => t.id)) + 1;
let nextNotificationId = Math.max(..._notifications.map((n) => n.id)) + 1;

const ROOM_POOL: { room: string; device: string; category: AiDeviceCategory }[] = [
  { room: "Living Room", device: "Ceiling Light", category: "light" },
  { room: "Living Room", device: "Standing Fan",  category: "fan" },
  { room: "Bedroom",     device: "Bedside Lamp",  category: "light" },
  { room: "Bedroom",     device: "Ceiling Fan",   category: "fan" },
  { room: "Kitchen",     device: "Exhaust Fan",   category: "fan" },
  { room: "Kitchen",     device: "Under Cabinet", category: "light" },
  { room: "Office",      device: "Desk Light",    category: "light" },
  { room: "Office",      device: "Window Blind",  category: "other" },
  { room: "Garage",      device: "Garage Door",   category: "door" },
  { room: "Front Door",  device: "Smart Lock",    category: "door" },
  { room: "Garden",      device: "Sprinkler",     category: "other" },
  { room: "Bathroom",    device: "Mirror Light",  category: "light" },
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clockLabel(date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timestampLabel(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clockLabel(date)}`;
}

function bumpVersion(version: string): string {
  const [major, minor] = version.replace(/^v/, "").split(".").map(Number);
  return `v${major}.${minor + 1}`;
}

/**
 * Builds N brand-new predictions with a plausible spread of confidence and
 * outcome — used by the "Run Prediction" mock action.
 */
export function generateRandomPredictions(count = 5): AiPrediction[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const target = pick(ROOM_POOL);
    const confidence = randomInt(72, 99);
    // High confidence auto-executes, mid waits for the user, low is skipped —
    // the same gating the Auto prediction mode would apply on the gateway.
    const action: AiPredictionAction = confidence >= 90 ? "Executed" : confidence >= 80 ? "Waiting" : "Skipped";
    const status: AiPredictionStatus = action === "Executed" ? "success" : action === "Waiting" ? "pending" : "failed";
    const at = new Date(now.getTime() - index * 60_000);
    return {
      id: nextPredictionId++,
      time: clockLabel(at),
      room: target.room,
      device: target.device,
      category: target.category,
      prediction: Math.random() > 0.45 ? "Turn ON" : "Turn OFF",
      confidence,
      action,
      status,
    };
  });
}

export const aiStore = {
  snapshot(): AiDashboardSnapshot {
    return {
      overview: _overview.map((m) => ({ ...m })),
      modelStatus: { ..._modelStatus },
      predictionStats: _predictionStats.map((s) => ({ ...s })),
      predictions: [..._predictions],
      accuracyTrend: [..._accuracyTrend],
      distribution: distribution.map((d) => ({ ...d })),
      recommendations: [..._recommendations],
      trainingHistory: [..._trainingHistory],
      featureImportance: featureImportance.map((f) => ({ ...f })),
      dataset: { ...dataset, classDistribution: { ...dataset.classDistribution } },
      notifications: [..._notifications],
    };
  },

  /** Prepends freshly generated predictions and keeps the table bounded. */
  addPredictions(rows: AiPrediction[]) {
    _predictions = [...rows, ..._predictions].slice(0, 40);
    _predictionStats = _predictionStats.map((stat) =>
      stat.key === "today" ? { ...stat, value: stat.value + rows.length } : stat
    );
    aiStore.pushNotification("info", "New prediction available.", `${rows.length} dự đoán mới vừa được sinh ra.`);
    return _predictions;
  },

  /**
   * Applies the result of a finished training round: bumps the version, nudges
   * every metric up slightly and appends a new run to the history timeline.
   */
  completeTraining() {
    const version = bumpVersion(_modelStatus.version);
    const previous = _trainingHistory[0];
    const accuracy = Math.min(99, Number((previous.accuracy + 0.3).toFixed(1)));
    const samples = previous.samples + randomInt(180, 640);
    const trainedAt = timestampLabel();

    _modelStatus = {
      ..._modelStatus,
      version,
      lastTraining: trainedAt,
      status: "running",
      trainingProgress: 100,
      health: "healthy",
    };

    _trainingHistory = [
      { id: nextTrainingId++, version, accuracy, samples, durationSec: randomInt(14, 26), status: "completed", trainedAt },
      ..._trainingHistory,
    ];

    _overview = _overview.map((metric) => {
      if (metric.key === "accuracy") return { ...metric, value: `${accuracy.toFixed(1)}%`, delta: 0.3 };
      if (metric.key === "dataset")  return { ...metric, value: samples.toLocaleString("en-US"), delta: samples - previous.samples };
      return metric;
    });

    const today = new Date();
    _accuracyTrend = [
      ..._accuracyTrend.slice(1),
      { date: timestampLabel(today).slice(0, 10), label: `${pad(today.getDate())}/${pad(today.getMonth() + 1)}`, accuracy },
    ];

    aiStore.pushNotification("success", "Model retrained successfully.", `Random Forest ${version} — accuracy ${accuracy.toFixed(1)}%.`);
    return _modelStatus;
  },

  /** Accept/Reject both remove the card; accept also logs an executed action. */
  resolveRecommendation(id: number, accepted: boolean) {
    const target = _recommendations.find((r) => r.id === id);
    _recommendations = _recommendations.filter((r) => r.id !== id);
    if (!target) return _recommendations;

    if (accepted) {
      const executed: AiPrediction = {
        id: nextPredictionId++,
        time: clockLabel(),
        room: target.room,
        device: target.device,
        category: target.category,
        prediction: target.action === "ON" ? "Turn ON" : "Turn OFF",
        confidence: target.confidence,
        action: "Executed",
        status: "success",
      };
      _predictions = [executed, ..._predictions].slice(0, 40);
      _predictionStats = _predictionStats.map((stat) =>
        stat.key === "automated" ? { ...stat, value: stat.value + 1 } : stat
      );
    } else {
      _predictionStats = _predictionStats.map((stat) =>
        stat.key === "override" ? { ...stat, value: stat.value + 1 } : stat
      );
    }
    return _recommendations;
  },

  pushNotification(level: AiNotificationLevel, message: string, detail: string) {
    _notifications = [
      { id: nextNotificationId++, level, message, detail, time: clockLabel() },
      ..._notifications,
    ].slice(0, 12);
    return _notifications;
  },
};
