const API_BASE = 'https://api.kie.ai/api/v1';
const FILE_UPLOAD_BASE = 'https://kieai.redpandaai.co';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ImageModelId =
  | 'nano-banana-2'
  | 'seedream/5-lite-text-to-image'
  | 'seedream/5-lite-image-to-image';

export interface ImageGenerationRequest {
  prompt: string;
  model: ImageModelId;
  aspectRatio: string;
  quality: string; // '1K'|'2K'|'4K' for nano, 'basic'|'high' for seedream
  referenceImages?: string[]; // URLs for image-to-image
  outputFormat?: string; // 'png'|'jpg' for nano
}

export interface ImageGenerationResult {
  predictionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal API response shapes
// ---------------------------------------------------------------------------

interface CreateTaskResponse {
  code: number;
  msg: string;
  data: { taskId: string };
}

interface RecordInfoResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    status: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
    resultJson?: string;
    failReason?: string;
  };
}

interface FileUploadResponse {
  code: number;
  msg: string;
  data: { url: string };
}

// ---------------------------------------------------------------------------
// Input builder (model-specific)
// ---------------------------------------------------------------------------

function buildTaskInput(request: ImageGenerationRequest): Record<string, unknown> {
  const { model, prompt, aspectRatio, quality, referenceImages, outputFormat } = request;

  if (model === 'nano-banana-2') {
    return {
      prompt,
      image_input: referenceImages ?? [],
      aspect_ratio: aspectRatio || 'auto',
      resolution: quality || '1K',
      output_format: outputFormat || 'jpg',
    };
  }

  if (model === 'seedream/5-lite-text-to-image') {
    return {
      prompt,
      aspect_ratio: aspectRatio || '1:1',
      quality: quality || 'basic',
      nsfw_checker: true,
    };
  }

  if (model === 'seedream/5-lite-image-to-image') {
    return {
      prompt,
      image_urls: referenceImages ?? [],
      aspect_ratio: aspectRatio || '1:1',
      quality: quality || 'basic',
      nsfw_checker: true,
    };
  }

  throw new Error(`Unknown image model: ${model}`);
}

// ---------------------------------------------------------------------------
// KieClient — image generation
// ---------------------------------------------------------------------------

export class KieClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Submit a new image generation task. Returns the remote task ID. */
  async generate(request: ImageGenerationRequest): Promise<{ predictionId: string }> {
    const input = buildTaskInput(request);

    const response = await fetch(`${API_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: request.model, input }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Kie.ai createTask error: HTTP ${response.status} — ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as CreateTaskResponse;

    if (data.code !== 200) {
      throw new Error(`Kie.ai createTask failed: ${data.msg}`);
    }

    return { predictionId: data.data.taskId };
  }

  /** Poll the status of a previously created task. */
  async getStatus(predictionId: string): Promise<ImageGenerationResult> {
    const response = await fetch(
      `${API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(predictionId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Kie.ai recordInfo error: HTTP ${response.status} — ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as RecordInfoResponse;

    if (data.code !== 200) {
      return {
        predictionId,
        status: 'failed',
        error: data.msg || 'Unknown API error',
      };
    }

    const taskStatus = data.data.status;

    if (taskStatus === 'success') {
      let imageUrl: string | undefined;
      if (data.data.resultJson) {
        try {
          const resultData = JSON.parse(data.data.resultJson) as { resultUrls?: string[] };
          imageUrl = resultData.resultUrls?.[0];
        } catch {
          // resultJson was not valid JSON — ignore
        }
      }
      return { predictionId, status: 'completed', imageUrl };
    }

    if (taskStatus === 'fail') {
      return {
        predictionId,
        status: 'failed',
        error: data.data.failReason || 'Image generation failed',
      };
    }

    // waiting | queuing | generating → still in progress
    return { predictionId, status: 'processing' };
  }

  /**
   * Upload a local image file to Kie's CDN and return the hosted URL.
   * The URL can then be passed as a reference image in subsequent requests.
   */
  async uploadImage(filePath: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const uploadPath = `uploads/${Date.now()}`;

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    formData.append('uploadPath', uploadPath);
    formData.append('fileName', fileName);

    const response = await fetch(`${FILE_UPLOAD_BASE}/api/file-stream-upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Kie.ai file upload error: HTTP ${response.status} — ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as FileUploadResponse;

    if (data.code !== 200) {
      throw new Error(`Kie.ai file upload failed: ${data.msg}`);
    }

    return data.data.url;
  }
}
