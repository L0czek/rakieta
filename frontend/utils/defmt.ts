export const DEFMT_LOG_TOPIC = 'log/defmt';
export const TEST_STAND_CONTROLLER_ELF_TOPIC = 'shared/firmware/test_stand_controller/elf';
export const DEFMT_WASM_MODULE_URL = '/defmt-mqtt-decoder/defmt_mqtt_decoder.js';
export const MAX_PENDING_DEFMT_CHUNKS = 256;

export interface DecodedDefmtChunk {
  lines: string[];
  warnings: string[];
}

export interface DefmtDecoderInstance {
  decodeChunk(payload: Uint8Array): DecodedDefmtChunk;
}

export interface DefmtDecoderModule {
  default(): Promise<unknown>;
  DefmtDecoder: new (elfBytes: Uint8Array) => DefmtDecoderInstance;
}

export const loadDefmtDecoderModule = async (): Promise<DefmtDecoderModule> => {
  const module = (await import(/* @vite-ignore */ DEFMT_WASM_MODULE_URL)) as DefmtDecoderModule;
  await module.default();
  return module;
};

export const formatDefmtError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const toUint8Array = (message: unknown): Uint8Array => {
  if (message instanceof Uint8Array) {
    return message;
  }

  if (typeof message === 'string') {
    return new TextEncoder().encode(message);
  }

  if (message instanceof ArrayBuffer) {
    return new Uint8Array(message);
  }

  if (ArrayBuffer.isView(message)) {
    return new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
  }

  return new Uint8Array(message as ArrayLike<number>);
};
