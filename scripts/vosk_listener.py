#!/usr/bin/env python3
"""
Reconocimiento de voz local con Vosk (sin conexión).

Lee audio PCM de 16 bits mono por la entrada estándar (lo envía arecord a
través del sistema del aula) y escribe una línea JSON por cada frase
reconocida: {"text": "..."}. Vosk detecta el final de cada frase por los
silencios, así que no hace falta un detector de voz aparte.

El audio no se guarda en ningún sitio y no sale de la Raspberry Pi.

Uso: python3 vosk_listener.py --model models/vosk-model-small-es-0.42 --rate 16000
"""

import argparse
import json
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--rate", type=int, default=16000)
    args = parser.parse_args()

    try:
        from vosk import KaldiRecognizer, Model, SetLogLevel
    except ImportError:
        emit({"error": "Falta el paquete vosk (pip install vosk)"})
        return 1

    SetLogLevel(-1)
    try:
        model = Model(args.model)
    except Exception as error:  # el modelo no existe o está incompleto
        emit({"error": f"No se pudo cargar el modelo {args.model}: {error}"})
        return 1

    recognizer = KaldiRecognizer(model, args.rate)
    emit({"ready": True})

    while True:
        data = sys.stdin.buffer.read(4000)
        if not data:
            break
        if recognizer.AcceptWaveform(data):
            text = json.loads(recognizer.Result()).get("text", "").strip()
            if text:
                emit({"text": text})

    text = json.loads(recognizer.FinalResult()).get("text", "").strip()
    if text:
        emit({"text": text})
    return 0


if __name__ == "__main__":
    sys.exit(main())
