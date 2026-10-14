import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, retry, timeout, shareReplay } from 'rxjs/operators';

interface AudioCacheItem {
  blob: Blob;
  timestamp: number;
  priority: 'high' | 'medium' | 'low';
  size: number; // blob size in bytes for memory management
}

@Injectable({
  providedIn: 'root'
})
export class TextToSpeechService {
  private readonly apiUrl = 'http://localhost:8080/api/v1/questions/generateAudio';
  private readonly MAX_CACHE_SIZE = 10; // Maximum number of cached items
  private readonly MAX_CACHE_MEMORY = 50 * 1024 * 1024; // 50MB max memory
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly REQUEST_TIMEOUT = 15000; // 15 seconds
  private readonly MAX_RETRIES = 2;

  private audioElement: HTMLAudioElement | null = null;
  private audioQueue: { text: string; audio: HTMLAudioElement }[] = [];
  private isPlaying = false;

  // Enhanced cache with metadata
  private audioCache = new Map<string, AudioCacheItem>();
  private pendingRequests = new Map<string, Observable<Blob>>();
  private currentCacheMemory = 0;

  private isSpeakingSubject = new BehaviorSubject<boolean>(false);
  public isSpeaking$ = this.isSpeakingSubject.asObservable();

  // Cleanup interval
  private cacheCleanupInterval: any;

  constructor(private http: HttpClient) {
    this.setupCacheCleanup();
    this.setupMemoryMonitoring();
  }

  /**
   * OPTIMIZED: Smart preloading strategy with priority and staggered timing
   * @param questions Array of question texts
   * @param currentIndex Current question index
   * @param preloadCount Number of questions to preload (default: 3)
   */
  smartPreload(questions: string[], currentIndex: number = 0, preloadCount: number = 3): void {
    if (!questions.length) return;

    const actualPreloadCount = Math.min(preloadCount, questions.length - currentIndex);

    console.log(`🚀 Smart preloading ${actualPreloadCount} questions from index ${currentIndex}`);

    for (let i = 0; i < actualPreloadCount; i++) {
      const questionIndex = currentIndex + i;
      if (questionIndex < questions.length) {
        // Priority: current = high, next = medium, others = low
        const priority: 'high' | 'medium' | 'low' =
          i === 0 ? 'high' : i === 1 ? 'medium' : 'low';

        // Stagger requests to avoid overwhelming the server
        const delay = i * 300; // 300ms between requests

        setTimeout(() => {
          this.prefetchAudio(questions[questionIndex], priority).subscribe({
            next: () => {
              console.log(`✅ Preloaded question ${questionIndex + 1}/${questions.length} (${priority} priority)`);
            },
            error: (err) => {
              console.warn(`⚠️ Failed to preload question ${questionIndex + 1}:`, err.message || err);
            }
          });
        }, delay);
      }
    }
  }

  /**
   * ENHANCED: Prefetch with priority, deduplication, and comprehensive error handling
   */
  prefetchAudio(text: string, priority: 'high' | 'medium' | 'low' = 'medium'): Observable<Blob> {
    if (!text?.trim()) {
      return throwError(() => new Error('Empty text provided for TTS'));
    }

    // Check cache first
    const cached = this.getCachedAudio(text);
    if (cached) {
      console.log(`💾 Cache hit for: "${text.substring(0, 50)}..."`);
      return of(cached);
    }

    // Check if request is already pending
    if (this.pendingRequests.has(text)) {
      console.log(`🔄 Reusing pending request for: "${text.substring(0, 50)}..."`);
      return this.pendingRequests.get(text)!;
    }

    // Create new request with comprehensive error handling
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    });

    const request$ = this.http.post(this.apiUrl, { text }, {
      headers,
      responseType: 'blob'
    }).pipe(
      timeout(this.REQUEST_TIMEOUT),
      retry({
        count: this.MAX_RETRIES,
        delay: (error, retryCount) => {
          console.warn(`🔄 Retry ${retryCount}/${this.MAX_RETRIES} for TTS request:`, error.message);
          return new Promise(resolve => setTimeout(resolve, retryCount * 1000));
        }
      }),
      catchError((error) => {
        console.error('❌ TTS request failed after retries:', error);
        return throwError(() => new Error(`TTS request failed: ${error.message || 'Unknown error'}`));
      }),
      shareReplay(1) // Share result with multiple subscribers
    );

    // Cache the pending request to prevent duplicates
    this.pendingRequests.set(text, request$);

    return new Observable(observer => {
      request$.subscribe({
        next: (audioBlob) => {
          try {
            // Cache the result with metadata
            this.setCachedAudio(text, audioBlob, priority);
            console.log(`💾 Cached audio for: "${text.substring(0, 50)}..." (${priority} priority)`);

            observer.next(audioBlob);
            observer.complete();
          } catch (error) {
            console.error('❌ Error caching audio:', error);
            observer.next(audioBlob); // Still return the blob even if caching fails
            observer.complete();
          } finally {
            // Always remove from pending requests
            this.pendingRequests.delete(text);
          }
        },
        error: (error) => {
          this.pendingRequests.delete(text);
          observer.error(error);
        }
      });
    });
  }

  /**
   * OPTIMIZED: Enhanced speak method with fallback strategies and better error handling
   */
  async speak(text: string, fallbackToSilent: boolean = false): Promise<void> {
    if (!text?.trim()) {
      if (fallbackToSilent) {
        console.warn('⚠️ Empty text provided, continuing silently');
        return Promise.resolve();
      }
      return Promise.reject(new Error('Empty text provided for TTS'));
    }

    // Cancel any ongoing browser TTS to prevent overlapping speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    return new Promise((resolve, reject) => {
      const cached = this.getCachedAudio(text);

      const playAudio = (blob: Blob) => {
        try {
          // If blob is empty, fallback to browser speech synthesis
          if (!blob || blob.size === 0) {
            console.warn('⚠️ ElevenLabs returned empty audio, using browser TTS fallback');
            this.speakWithBrowserTTS(text).then(resolve).catch(() => resolve());
            return;
          }

          const audioUrl = URL.createObjectURL(blob);
          this.audioElement = new Audio(audioUrl);
          this.audioElement.volume = 0.8;
          this.audioElement.preload = 'auto';

          // Set speaking state
          this.isSpeakingSubject.next(true);

          const cleanup = () => {
            URL.revokeObjectURL(audioUrl);
            this.isSpeakingSubject.next(false);
            this.isPlaying = false;
            this.audioElement = null;
          };

          this.audioElement.onended = () => {
            cleanup();
            console.log('🎵 Audio playback completed');
            resolve();
          };

          this.audioElement.onerror = (error) => {
            cleanup();
            console.error('❌ Audio playback error, falling back to browser TTS:', error);
            // Fallback to browser TTS instead of staying silent
            this.speakWithBrowserTTS(text).then(resolve).catch(() => resolve());
          };

          // Handle play promise rejection
          this.isPlaying = true;
          const playPromise = this.audioElement.play();

          if (playPromise !== undefined) {
            playPromise.catch(error => {
              cleanup();
              console.error('❌ Audio play failed, falling back to browser TTS:', error);
              this.speakWithBrowserTTS(text).then(resolve).catch(() => resolve());
            });
          }

        } catch (error) {
          this.isSpeakingSubject.next(false);
          this.isPlaying = false;
          console.error('❌ Audio setup error, falling back to browser TTS:', error);
          this.speakWithBrowserTTS(text).then(resolve).catch(() => resolve());
        }
      };

      if (cached) {
        console.log(`🎵 Playing cached audio for: "${text.substring(0, 50)}..."`);
        playAudio(cached);
      } else {
        console.log(`🌐 Fetching and playing audio for: "${text.substring(0, 50)}..."`);
        // Fetch with high priority for immediate playback
        this.prefetchAudio(text, 'high').subscribe({
          next: (blob) => playAudio(blob),
          error: (error) => {
            this.isSpeakingSubject.next(false);
            console.error('❌ Failed to fetch audio, falling back to browser TTS:', error);
            this.speakWithBrowserTTS(text).then(resolve).catch(() => resolve());
          }
        });
      }
    });
  }

  /**
   * Fallback: Use browser's built-in Web Speech API (free, no API key needed)
   */
  private speakWithBrowserTTS(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        console.warn('Browser TTS not supported');
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'fr-FR';

      // Guard flag to prevent multiple trySpeak() calls
      let hasSpoken = false;

      // Try to find a French voice, fallback to default
      const trySpeak = () => {
        // Prevent duplicate invocations from both onvoiceschanged and setTimeout
        if (hasSpoken) return;
        hasSpoken = true;

        const voices = window.speechSynthesis.getVoices();
        const frenchVoice = voices.find(v => v.lang.startsWith('fr'));
        if (frenchVoice) {
          utterance.voice = frenchVoice;
          utterance.lang = frenchVoice.lang;
        }

        this.isSpeakingSubject.next(true);

        utterance.onend = () => {
          this.isSpeakingSubject.next(false);
          console.log('🎵 Browser TTS completed');
          resolve();
        };

        utterance.onerror = (e) => {
          this.isSpeakingSubject.next(false);
          console.error('❌ Browser TTS error:', e);
          resolve(); // Always resolve to keep interview going
        };

        // Cancel again right before speaking to clear any queued utterances
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        console.log('🔊 Using browser TTS fallback for:', text.substring(0, 60));
      };

      // Voices may not be loaded yet on first call
      if (window.speechSynthesis.getVoices().length > 0) {
        trySpeak();
      } else {
        window.speechSynthesis.onvoiceschanged = () => trySpeak();
        // Safety timeout in case onvoiceschanged never fires
        setTimeout(() => {
          trySpeak();
        }, 500);
      }
    });
  }

  /**
   * Queue multiple texts for sequential playback
   */
  queueSpeak(text: string): void {
    if (!text?.trim()) {
      console.warn('⚠️ Empty text provided for queue, skipping');
      return;
    }

    this.prefetchAudio(text, 'medium').subscribe({
      next: (blob) => {
        try {
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          audio.volume = 0.8;
          this.audioQueue.push({ text, audio });

          if (!this.isPlaying) {
            this.processQueue();
          }
        } catch (error) {
          console.error('❌ Failed to create queued audio:', error);
        }
      },
      error: (error) => {
        console.error('❌ Failed to queue audio:', error);
      }
    });
  }

  /**
   * Process audio queue
   */
  private processQueue(): void {
    if (this.audioQueue.length === 0 || this.isPlaying) {
      return;
    }

    const next = this.audioQueue.shift();
    if (next) {
      this.isPlaying = true;
      this.isSpeakingSubject.next(true);

      next.audio.onended = () => {
        this.isSpeakingSubject.next(false);
        this.isPlaying = false;
        this.processQueue(); // Process next item
      };

      next.audio.onerror = (error) => {
        console.error('❌ Queued audio playback error:', error);
        this.isSpeakingSubject.next(false);
        this.isPlaying = false;
        this.processQueue(); // Continue with next item
      };

      next.audio.play().catch(error => {
        console.error('❌ Failed to play queued audio:', error);
        this.isSpeakingSubject.next(false);
        this.isPlaying = false;
        this.processQueue(); // Continue with next item
      });
    }
  }

  /**
   * Get cached audio with TTL check and priority update
   */
  private getCachedAudio(text: string): Blob | null {
    const cached = this.audioCache.get(text);

    if (!cached) return null;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.audioCache.delete(text);
      this.currentCacheMemory -= cached.size;
      console.log('🗑️ Removed expired cache entry');
      return null;
    }

    // Update timestamp for LRU behavior
    cached.timestamp = Date.now();

    return cached.blob;
  }

  /**
   * Set cached audio with smart eviction and memory management
   */
  private setCachedAudio(text: string, blob: Blob, priority: 'high' | 'medium' | 'low'): void {
    const blobSize = blob.size;

    // Check if we need to make space
    if (this.audioCache.size >= this.MAX_CACHE_SIZE ||
        this.currentCacheMemory + blobSize > this.MAX_CACHE_MEMORY) {
      this.evictCacheEntries(blobSize);
    }

    // Add new entry
    this.audioCache.set(text, {
      blob,
      timestamp: Date.now(),
      priority,
      size: blobSize
    });

    this.currentCacheMemory += blobSize;

    console.log(`📊 Cache: ${this.audioCache.size}/${this.MAX_CACHE_SIZE} items, ${Math.round(this.currentCacheMemory / 1024)}KB used`);
  }

  /**
   * Smart cache eviction based on priority, age, and size
   */
  private evictCacheEntries(neededSpace: number): void {
    const entries = Array.from(this.audioCache.entries());

    // Sort by priority (low first), then by age (old first)
    entries.sort((a, b) => {
      const priorityWeight = { low: 1, medium: 2, high: 3 };
      const priorityDiff = priorityWeight[a[1].priority] - priorityWeight[b[1].priority];

      if (priorityDiff !== 0) return priorityDiff;
      return a[1].timestamp - b[1].timestamp;
    });

    let freedSpace = 0;
    let removedCount = 0;

    // Remove entries until we have enough space or removed enough items
    for (const [key, value] of entries) {
      if (freedSpace >= neededSpace && removedCount >= 2) break;

      this.audioCache.delete(key);
      this.currentCacheMemory -= value.size;
      freedSpace += value.size;
      removedCount++;
    }

    console.log(`🗑️ Evicted ${removedCount} cache entries, freed ${Math.round(freedSpace / 1024)}KB`);
  }

  /**
   * Enhanced stop with comprehensive cleanup
   */
  stop(): void {
    // Stop current audio
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement = null;
    }

    // Stop browser TTS if active
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // Clear queue
    this.audioQueue.forEach(item => {
      try {
        item.audio.pause();
        item.audio.currentTime = 0;
      } catch (error) {
        // Ignore errors during cleanup
      }
    });
    this.audioQueue = [];

    // Cancel pending requests
    this.pendingRequests.clear();

    // Reset states
    this.isPlaying = false;
    this.isSpeakingSubject.next(false);

    console.log('🛑 TTS stopped and cleaned up');
  }

  /**
   * Periodic cache cleanup
   */
  private setupCacheCleanup(): void {
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      let removedCount = 0;
      let freedMemory = 0;

      for (const [key, value] of this.audioCache.entries()) {
        if (now - value.timestamp > this.CACHE_TTL) {
          this.audioCache.delete(key);
          this.currentCacheMemory -= value.size;
          freedMemory += value.size;
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`🧹 Periodic cleanup: removed ${removedCount} expired items, freed ${Math.round(freedMemory / 1024)}KB`);
      }
    }, 5 * 60 * 1000); // Clean every 5 minutes
  }

  /**
   * Monitor memory usage
   */
  private setupMemoryMonitoring(): void {
    setInterval(() => {
      if (this.currentCacheMemory > this.MAX_CACHE_MEMORY * 0.8) { // 80% threshold
        console.warn(`⚠️ Cache memory usage high: ${Math.round(this.currentCacheMemory / 1024)}KB`);
      }
    }, 30 * 1000); // Check every 30 seconds
  }

  /**
   * Get detailed cache statistics
   */
  getCacheStats(): {
    size: number;
    memoryUsed: number;
    memoryLimit: number;
    entries: Array<{key: string; priority: string; age: number; size: number}>
  } {
    const now = Date.now();
    const entries = Array.from(this.audioCache.entries()).map(([key, value]) => ({
      key: key.substring(0, 50) + (key.length > 50 ? '...' : ''),
      priority: value.priority,
      age: Math.round((now - value.timestamp) / 1000), // age in seconds
      size: Math.round(value.size / 1024) // size in KB
    }));

    return {
      size: this.audioCache.size,
      memoryUsed: Math.round(this.currentCacheMemory / 1024), // in KB
      memoryLimit: Math.round(this.MAX_CACHE_MEMORY / 1024), // in KB
      entries
    };
  }

  /**
   * Clear cache with options
   */
  clearCache(keepHighPriority: boolean = true): void {
    let removedCount = 0;
    let freedMemory = 0;

    if (keepHighPriority) {
      for (const [key, value] of this.audioCache.entries()) {
        if (value.priority !== 'high') {
          this.audioCache.delete(key);
          this.currentCacheMemory -= value.size;
          freedMemory += value.size;
          removedCount++;
        }
      }
      console.log(`🧹 Selective cache clear: removed ${removedCount} non-high-priority items`);
    } else {
      freedMemory = this.currentCacheMemory;
      removedCount = this.audioCache.size;
      this.audioCache.clear();
      this.currentCacheMemory = 0;
      console.log(`🧹 Full cache clear: removed all ${removedCount} items`);
    }

    this.pendingRequests.clear();

    if (removedCount > 0) {
      console.log(`💾 Freed ${Math.round(freedMemory / 1024)}KB of memory`);
    }
  }


  forceCacheGC(): void {
    const initialSize = this.audioCache.size;
    const initialMemory = this.currentCacheMemory;

    this.evictCacheEntries(this.MAX_CACHE_MEMORY); 

    console.log(`🗑️ Force GC: ${initialSize - this.audioCache.size} items removed, ${Math.round((initialMemory - this.currentCacheMemory) / 1024)}KB freed`);
  }


  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }


  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  destroy(): void {
    this.stop();
    this.clearCache(false);

    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }

    console.log('🏁 TTS service destroyed and cleaned up');
  }
}
