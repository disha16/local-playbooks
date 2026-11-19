//! Download and validate audio models without opening a screen or audio device.
use anyhow::Result;
use screenpipe_audio::{
    core::engine::AudioTranscriptionEngine,
    speaker::models::{get_or_download_model, PyannoteModel},
    transcription::whisper::model::download_whisper_model,
    vad::silero::SileroVad,
};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args().any(|arg| arg == "--version") {
        println!("playbooks-prepare-models {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if !std::env::args().any(|arg| arg == "--download") {
        anyhow::bail!("Use --download to prepare local audio models. No recording takes place.");
    }
    println!("SETUP whisper");
    tokio::task::spawn_blocking(|| download_whisper_model(Arc::new(AudioTranscriptionEngine::WhisperTiny))).await??;
    println!("SETUP voice-detection");
    SileroVad::ensure_model_available().await?;
    println!("SETUP speaker-segmentation");
    get_or_download_model(PyannoteModel::Segmentation).await?;
    println!("SETUP speaker-embedding");
    get_or_download_model(PyannoteModel::Embedding).await?;
    println!("SETUP ready");
    Ok(())
}
