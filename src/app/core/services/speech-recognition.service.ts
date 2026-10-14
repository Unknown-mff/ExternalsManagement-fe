// src/app/core/services/speech-recognition.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import {
  SpeechRecognitionResult,
  SpeechRecognitionState,
  SpeechRecognitionConfig,
  SpeechRecognitionEvent,
  SpeechRecognitionError,
  ISpeechRecognitionService
} from '../api/interfaces/speech-recognition.interface';

@Injectable({
  providedIn: 'root'
})
export class SpeechRecognitionService implements ISpeechRecognitionService {
  private recognition: any;
  private isListening = false;
  private finalTranscript = '';
  private interimTranscript = '';
  private lastSpeechTime = 0;
  private restartTimeout: any;
  private shouldRestart = false;
  private config: SpeechRecognitionConfig = {
    lang: 'fr-FR',
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    autoRestart: true,
    restartDelay: 1000
  };

  // Observables for state management
  private stateSubject = new BehaviorSubject<SpeechRecognitionState>({
    isListening: false,
    isSupported: this.isSupported(),
    error: null,
    finalTranscript: '',
    interimTranscript: '',
    combinedTranscript: ''
  });

  private resultSubject = new Subject<SpeechRecognitionResult>();
  private errorSubject = new Subject<SpeechRecognitionError>();
  private eventSubject = new Subject<SpeechRecognitionEvent>();

  // Public observables
  public state$ = this.stateSubject.asObservable();
  public result$ = this.resultSubject.asObservable();
  public error$ = this.errorSubject.asObservable();
  public event$ = this.eventSubject.asObservable();

  constructor() {
    this.initializeRecognition();
  }

  /**
   * Check if speech recognition is supported in the current browser
   */
  public isSupported(): boolean {
    const SpeechAPI = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    return !!SpeechAPI;
  }

  /**
   * Get current speech recognition state
   */
  public getCurrentState(): SpeechRecognitionState {
    return this.stateSubject.value;
  }

  /**
   * Configure speech recognition settings
   */
  public configure(config: Partial<SpeechRecognitionConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.recognition) {
      this.applyConfiguration();
    }
  }

  /**
   * Initialize speech recognition engine
   */
  private initializeRecognition(): void {
    if (!this.isSupported()) {
      this.emitError({
        error: 'not-supported',
        message: 'Speech recognition is not supported in this browser. Please use Chrome or Edge.'
      });
      return;
    }

    const SpeechAPI = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    this.recognition = new SpeechAPI();
    this.applyConfiguration();
    this.attachEventHandlers();
  }

  /**
   * Apply configuration to speech recognition
   */
  private applyConfiguration(): void {
    if (!this.recognition) return;

    this.recognition.lang = this.config.lang || 'en-US';
    this.recognition.continuous = this.config.continuous ?? true;
    this.recognition.interimResults = this.config.interimResults ?? true;
    this.recognition.maxAlternatives = this.config.maxAlternatives || 1;
  }

  /**
   * Attach event handlers to speech recognition
   */
  private attachEventHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onresult = (event: any) => this.handleResult(event);
    this.recognition.onerror = (event: any) => this.handleError(event);
    this.recognition.onend = () => this.handleEnd();
    this.recognition.onstart = () => this.handleStart();
    this.recognition.onspeechstart = () => this.handleSpeechStart();
    this.recognition.onspeechend = () => this.handleSpeechEnd();
    this.recognition.onaudiostart = () => this.handleAudioStart();
    this.recognition.onaudioend = () => this.handleAudioEnd();
  }

  /**
   * Start speech recognition
   */
  public start(): void {
    if (!this.isSupported()) {
      this.emitError({
        error: 'not-supported',
        message: 'Speech recognition is not supported'
      });
      return;
    }

    if (this.isListening) {
      console.log('Speech recognition is already running');
      return;
    }

    try {
      this.shouldRestart = this.config.autoRestart ?? true;
      this.clearTranscripts();
      this.recognition.start();
      this.emitEvent('start');
      console.log('Speech recognition started');
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.emitError({
        error: 'start-failed',
        message: 'Failed to start speech recognition'
      });
    }
  }

  /**
   * Stop speech recognition
   */
  public stop(): void {
    this.shouldRestart = false;
    this.clearRestartTimeout();

    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.emitEvent('end');
      console.log('Speech recognition stopped');
    }

    this.updateState({ isListening: false });
  }

  /**
   * Reset all transcripts and state
   */
  public reset(): void {
    this.stop();
    this.clearTranscripts();
    this.updateState({
      error: null,
      finalTranscript: '',
      interimTranscript: '',
      combinedTranscript: ''
    });
  }

  /**
   * Get current final transcript
   */
  public getFinalTranscript(): string {
    return this.finalTranscript;
  }

  /**
   * Get current interim transcript
   */
  public getInterimTranscript(): string {
    return this.interimTranscript;
  }

  /**
   * Get combined transcript (final + interim)
   */
  public getCombinedTranscript(): string {
    return this.finalTranscript + this.interimTranscript;
  }

  /**
   * Handle speech recognition results
   */
  private handleResult(event: any): void {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence;

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
        this.resultSubject.next({
          transcript,
          isFinal: true,
          confidence: confidence || 0,
          timestamp: Date.now()
        });
      } else {
        interimTranscript += transcript;
        this.resultSubject.next({
          transcript,
          isFinal: false,
          confidence: confidence || 0,
          timestamp: Date.now()
        });
      }
    }

    this.finalTranscript += finalTranscript;
    this.interimTranscript = interimTranscript;
    this.lastSpeechTime = Date.now();

    this.updateState({
      finalTranscript: this.finalTranscript,
      interimTranscript: this.interimTranscript,
      combinedTranscript: this.getCombinedTranscript(),
      error: null
    });

    this.emitEvent('result', { finalTranscript, interimTranscript });
  }

  /**
   * Handle speech recognition errors
   */
  private handleError(event: any): void {
    console.error('Speech recognition error:', event.error);

    const errorMapping: { [key: string]: string } = {
      'network': 'Reconnexion au service de reconnaissance vocale...',
      'not-allowed': 'Microphone access denied. Please allow microphone permissions.',
      'no-speech': 'No speech detected. Please try speaking again.',
      'audio-capture': 'Audio capture failed. Please check your microphone.',
      'service-not-allowed': 'Speech recognition service not allowed.',
      'aborted': 'Speech recognition was aborted.',
      'language-not-supported': 'Language not supported for speech recognition.'
    };

    const errorMessage = errorMapping[event.error] || 'Speech recognition error occurred';

    const error: SpeechRecognitionError = {
      error: event.error,
      message: errorMessage,
      code: event.error
    };

    // Only show error state for non-transient errors
    if (event.error !== 'network' && event.error !== 'no-speech' && event.error !== 'aborted') {
      this.updateState({ error: errorMessage });
    }
    this.errorSubject.next(error);
    this.emitEvent('error', error);

    // Only stop auto-restart on truly fatal errors (not network which is transient)
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      this.shouldRestart = false;
    }
    // For network errors, reinitialize the recognition object to get a fresh connection
    if (event.error === 'network') {
      console.log('Network error in speech recognition - will reinitialize on next restart');
      this.reinitializeRecognition();
    }
  }

  /**
   * Handle speech recognition end
   */
  private handleEnd(): void {
    this.isListening = false;
    this.updateState({ isListening: false });
    this.emitEvent('end');
    console.log('Speech recognition ended');

    // Auto-restart if needed and conditions are met
    if (this.shouldRestart && this.canRestart()) {
      this.scheduleRestart();
    }
  }

  /**
   * Handle speech recognition start
   */
  private handleStart(): void {
    this.isListening = true;
    this.updateState({ isListening: true, error: null });
    this.emitEvent('start');
    console.log('Speech recognition started successfully');
  }

  /**
   * Handle speech start
   */
  private handleSpeechStart(): void {
    this.emitEvent('speechstart');
    console.log('Speech detected');
  }

  /**
   * Handle speech end
   */
  private handleSpeechEnd(): void {
    this.emitEvent('speechend');
    console.log('Speech ended');
  }

  /**
   * Handle audio start
   */
  private handleAudioStart(): void {
    console.log('Audio capture started');
  }

  /**
   * Handle audio end
   */
  private handleAudioEnd(): void {
    console.log('Audio capture ended');
  }

  /**
   * Check if speech recognition can be restarted
   */
  private canRestart(): boolean {
    return this.shouldRestart && this.isSupported();
  }

  /**
   * Schedule automatic restart of speech recognition
   */
  private scheduleRestart(): void {
    this.clearRestartTimeout();
    const delay = this.config.restartDelay || 1000;

    this.restartTimeout = setTimeout(() => {
      if (this.canRestart()) {
        console.log('Auto-restarting speech recognition...');
        try {
          this.recognition.start();
        } catch (error: any) {
          console.error('Failed to restart speech recognition:', error);
          // If the recognition instance is in a bad state, reinitialize and try again
          if (error?.message?.includes('already started') || error?.name === 'InvalidStateError') {
            console.log('Recognition already started - skipping restart');
          } else {
            this.reinitializeRecognition();
            setTimeout(() => {
              if (this.canRestart()) {
                try { this.recognition.start(); } catch (e) { console.error('Second restart attempt failed:', e); }
              }
            }, 500);
          }
        }
      }
    }, delay);
  }

  /**
   * Reinitialize the speech recognition engine (useful after network errors)
   */
  private reinitializeRecognition(): void {
    try {
      if (this.isListening) {
        this.recognition?.stop();
        this.isListening = false;
      }
    } catch (e) { /* ignore */ }

    const SpeechAPI = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SpeechAPI) {
      this.recognition = new SpeechAPI();
      this.applyConfiguration();
      this.attachEventHandlers();
      console.log('Speech recognition engine reinitialized');
    }
  }

  /**
   * Clear restart timeout
   */
  private clearRestartTimeout(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
  }

  /**
   * Clear all transcripts
   */
  private clearTranscripts(): void {
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.lastSpeechTime = 0;
  }

  /**
   * Update the state subject with new values
   */
  private updateState(updates: Partial<SpeechRecognitionState>): void {
    const currentState = this.stateSubject.value;
    this.stateSubject.next({ ...currentState, ...updates });
  }

  /**
   * Emit error event
   */
  private emitError(error: SpeechRecognitionError): void {
    this.errorSubject.next(error);
    this.updateState({ error: error.message });
  }

  /**
   * Emit general event
   */
  private emitEvent(type: SpeechRecognitionEvent['type'], data?: any): void {
    this.eventSubject.next({
      type,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stop();
    this.clearRestartTimeout();
    this.stateSubject.complete();
    this.resultSubject.complete();
    this.errorSubject.complete();
    this.eventSubject.complete();
  }
}
