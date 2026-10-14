import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { INTERVIEW_RULES, InterviewRule } from '../../../../core/constants/interview-rules.const';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { PanelModule } from 'primeng/panel';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DividerModule } from 'primeng/divider';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { Question } from '../../../../core/models/question';
import { TextToSpeechService } from '../../../../core/services/text-to-speech.service';
import { InterviewEvaluationService } from '../../../../core/services/interview-evaluation.service';
import { NotificationService } from '../../../../core/services/utils/notification.service';
import { SpeechRecognitionService } from '../../../../core/services/speech-recognition.service';
import { Answer } from '../../../../core/models/answer';
import { ActivatedRoute } from '@angular/router';
import { InterviewService } from '../../../../core/services/interview.service';
import { TokenValidationService } from '../../../../core/services/token-validation.service';
import { AnswerService, CreateAnswerRequest } from '../../../../core/services/answer.service';
import { AvatarModule } from 'primeng/avatar';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { Router } from '@angular/router';
import { cameraTransition, slideInInterview, fadeInControls, slideInTranscript } from '../../../../shared/layout/animations/interview-meeting.animations';
import { fadeIn } from '../../../../shared/layout/animations/common.animation';
import { QuestionsAndAnswersForEvaluationDTO } from '../../../../core/models/interview-evaluation';
import { OfferService } from '../../../../core/services/offer.service';
import { CandidateService } from '../../../../core/services/candidate.service';
import { DialogModule } from 'primeng/dialog';
import { TranslateService, TranslateModule } from '@ngx-translate/core';

type SpeechRecognitionState = {
    isListening: boolean;
    isSupported: boolean;
    error: string | null;
    finalTranscript: string;
    interimTranscript: string;
    combinedTranscript: string;
};

interface Language {
    code: string;
    name: string;
    flag: string;
}

@Component({
    selector: 'app-interview-meeting',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        CardModule,
        MessageModule,
        InputTextModule,
        PanelModule,
        ProgressSpinnerModule,
        ToastModule,
        DividerModule,
        DialogModule,
        TagModule,
        SkeletonModule,
        AvatarModule,
        ScrollPanelModule,
        TranslateModule
    ],
    templateUrl: './interview-meeting.component.html',
    providers: [MessageService, NotificationService],
    animations: [cameraTransition, slideInInterview, fadeInControls, slideInTranscript, fadeIn]
})
export class InterviewMeetingComponent implements AfterViewInit, OnDestroy {
    // UI State
    interviewStarted = false;
    previewMode = false;
    isInterviewInProgress = false;
    isInterviewFinalizing = false;
    isInterviewCompleted = false;
    isTranscriptVisible = true;
    isCameraReady = false;
    isCameraEnabled = false;
    showRulesAndPreview = true;
    showSubmitButton = false;
    canSubmitAnswer = false;
    isWaitingForAnswer = false;
    aiSpeaking = false;
    showSubtitles = false;
    showRulesDialog = false;
    isReadyToSpeak = false;
    transcriptions: string[] = [];

    // User interaction
    currentUserAnswer: string = '';
    userWarningMessage: string | null = null;
    liveSubtitle = '';

    // Translation
    languages: Language[] = [
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'es', name: 'Español', flag: '🇪🇸' }
    ];
    selectedLanguage: Language = this.languages[0];
    showLanguageDropdown = true;

    // Camera
    stream: MediaStream | null = null;
    private preventResizeOnce = false;

    // Speech Recognition
    isAudioEnabled = false;
    speechRecognitionState: SpeechRecognitionState = {
        isListening: false,
        isSupported: false,
        error: null,
        finalTranscript: '',
        interimTranscript: '',
        combinedTranscript: ''
    };

    // View Children
    @ViewChild('previewVideo') previewVideo!: ElementRef<HTMLVideoElement>;
    @ViewChild('interviewVideo') interviewVideo!: ElementRef<HTMLVideoElement>;
    @ViewChild('transcriptScroll') scrollPanel!: any;

    // Interview Data
    questions: Question[] = [];
    currentQuestionIndex = 0;
    timeRemaining = 0;
    questionInterval: any;
    transcriptMessages: {
        sender: string;
        text: string;
        align: 'left' | 'right';
        type: 'question' | 'answer';
    }[] = [];
    currentTime: string = '';
    interviewRules: InterviewRule[] = INTERVIEW_RULES;
    interviewToken: any;
    interviewId: string = '';
    interviewStartTime = 0;
    questionStartTime = 0;
    candidateName: string = '';
    offerTitle: string = '';

    // Observables
    private destroy$ = new Subject<void>();
    private eventListenersRegistered = false;

    constructor(
        private tts: TextToSpeechService,
        private evaluationService: InterviewEvaluationService,
        private notify: NotificationService,
        private speechRecognitionService: SpeechRecognitionService,
        private cdr: ChangeDetectorRef,
        private router: Router,
        private activatedRoute: ActivatedRoute,
        private interviewService: InterviewService,
        private tokenValidationService: TokenValidationService,
        private answerService: AnswerService,
        private candidateService: CandidateService,
        private offerService: OfferService,
        private translate: TranslateService
    ) {}

    ngOnInit(): void {
        this.initializeComponent();
        this.subscribesToSpeechRecognition();
        this.subscribeToTTSState();
        this.initializeTranslation();
    }

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.requestCameraPermission();
        }, 500);
    }

    private initializeTranslation(): void {
        // Set default language
        this.translate.setDefaultLang('en');
        this.translate.use('en');
    }

    onLanguageChange(): void {
        this.translate.use(this.selectedLanguage.code);
        console.log('Language changed to:', this.selectedLanguage.code);
    }

    showInterviewRules(): void {
        this.showRulesDialog = true;
    }

    hideInterviewRules(): void {
        this.showRulesDialog = false;
    }

    private initializeComponent(): void {
        this.activatedRoute.params.subscribe((params) => {
            const token = params['token'];
            if (token) {
                this.interviewToken = token;
                console.log('Extracted interview token:', token);
                this.loadInterviewFromToken(token);
            } else {
                console.error('No interview token found in route');
                this.notify.showError('Error', 'Invalid interview link.');
                this.router.navigate(['/']);
            }
        });

        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        this.checkSpeechRecognitionSupport();
    }

    private subscribeToTTSState(): void {
        this.tts.isSpeaking$.pipe(takeUntil(this.destroy$)).subscribe((isSpeaking) => {
            this.aiSpeaking = isSpeaking;
            this.cdr.detectChanges();
        });
    }

    private loadInterviewFromToken(token: string): void {
        this.tokenValidationService.getInterviewIdFromToken(token).subscribe({
            next: (interviewId) => {
                console.log('Retrieved interview ID:', interviewId);
                this.interviewId = interviewId;

                this.interviewService.getInterviewById(interviewId).subscribe({
                    next: (interview) => {
                        console.log('Interview details:', interview);

                        if (interview.candidateId) {
                            this.candidateService.getCandidate(interview.candidateId).subscribe({
                                next: (candidate) => {
                                    this.candidateName = candidate.fullName || '';
                                    console.log('Candidate name:', this.candidateName);
                                },
                                error: (err) => console.error('Failed to load candidate:', err)
                            });
                        }

                        if (interview.offerId) {
                            this.offerService.getOfferById(interview.offerId).subscribe({
                                next: (offer) => {
                                    this.offerTitle = offer.title || '';
                                    console.log('Offer title:', this.offerTitle);
                                },
                                error: (err) => console.error('Failed to load offer:', err)
                            });
                        }

                        this.loadInterviewQuestions(interviewId);
                    },
                    error: (err) => {
                        console.error('Failed to load interview:', err);
                        this.loadInterviewQuestions(interviewId);
                    }
                });
            },
            error: (err) => {
                console.error('Failed to get interview ID from token:', err);
                this.notify.showError('Error', 'Failed to retrieve interview information.');
                this.router.navigate(['/token-error']);
            }
        });
    }

    private loadInterviewQuestions(interviewId: string): void {
        console.log('Loading questions for interview ID:', interviewId);
        this.interviewService.getInterviewQuestions(interviewId).subscribe({
            next: (questions) => {
                this.questions = questions;
                this.currentQuestionIndex = 0;
                console.log('Loaded interview questions:', questions);
                this.smartPreloadInitialQuestions();
            },
            error: (err) => {
                console.error('Failed to load interview questions:', err);
                this.notify.showError('Error', 'Failed to load interview questions. Please refresh the page.');
            }
        });
    }

    private smartPreloadInitialQuestions(): void {
        if (this.questions && this.questions.length > 0) {
            const questionTexts = this.questions.map((q) => q.description);
            this.tts.smartPreload(questionTexts, 0);
            console.log('Smart preloading started for first 3 questions');
        }
    }

    private subscribesToSpeechRecognition(): void {
        this.speechRecognitionService.state$.pipe(takeUntil(this.destroy$)).subscribe((state) => {
            this.speechRecognitionState = state;
            this.updateUIFromSpeechState(state);
            this.cdr.detectChanges();
        });

        this.speechRecognitionService.result$.pipe(takeUntil(this.destroy$)).subscribe((result) => {
            this.handleSpeechResult(result);
        });

        this.speechRecognitionService.error$.pipe(takeUntil(this.destroy$)).subscribe((error) => {
            this.handleSpeechError(error?.message ?? String(error));
        });
    }

    getEstimatedTotalDuration(): number {
        if (!this.questions?.length) return 15;

        const totalMinutes = this.questions.reduce((total, question) =>
            total + (question.durationInMinutes || 0), 0
        );

        return Math.floor(totalMinutes / 10 + 0.4) * 10;
    }

    private updateUIFromSpeechState(state: SpeechRecognitionState): void {
        this.liveSubtitle = state.combinedTranscript;
        this.currentUserAnswer = state.finalTranscript;
        this.canSubmitAnswer = state.finalTranscript.trim().length > 0;

        if (state.error) {
            this.userWarningMessage = state.error;
        }
    }

    private handleSpeechResult(result: any): void {
        if (!result.isFinal) {
            this.liveSubtitle = this.speechRecognitionService.getCombinedTranscript();
        }
        if (result.isFinal) {
            this.currentUserAnswer = this.speechRecognitionService.getFinalTranscript();
            this.canSubmitAnswer = this.currentUserAnswer.trim().length > 0;
        }

        this.cdr.detectChanges();
    }

    private handleSpeechError(error: string): void {
        console.error('Speech recognition error:', error);
        this.notify.showError('Speech Recognition Error', error);
        this.userWarningMessage = error;
    }

    checkSpeechRecognitionSupport(): void {
        if (!this.speechRecognitionService.isSupported()) {
            this.userWarningMessage = 'Speech recognition is not supported in your browser. Please use Chrome or Edge.';
            this.notify.showError('Browser Not Supported', 'Speech recognition requires Chrome or Edge browser.');
        }
    }

    updateClock(): void {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        this.currentTime = `${hours}:${minutes}:${seconds}`;
    }

    async requestCameraPermission(): Promise<void> {
        try {
            console.log('Requesting camera and microphone permission...');

            // First, stop any existing stream
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            // Request camera with basic constraints
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            });

            if (!this.stream) {
                throw new Error('No media stream received.');
            }

            const videoTracks = this.stream.getVideoTracks();
            const audioTracks = this.stream.getAudioTracks();

            this.isCameraEnabled = videoTracks.length > 0;
            this.isAudioEnabled = audioTracks.length > 0;

            console.log('Camera enabled:', this.isCameraEnabled, 'Tracks:', videoTracks.length);
            console.log('Audio enabled:', this.isAudioEnabled, 'Tracks:', audioTracks.length);

            if (this.isCameraEnabled) {
                this.previewMode = true;
                this.isCameraReady = true;

                // Wait for the view to update and video element to be available
                setTimeout(() => {
                    this.attachStreamToVideoElement(this.previewVideo?.nativeElement);
                }, 300);
            }

            this.monitorCameraAndAudio();

        } catch (err: any) {
            console.error('❌ Camera/mic error:', err);
            this.isCameraEnabled = false;
            this.isAudioEnabled = false;
            this.previewMode = false;
            this.isCameraReady = false;

            let errorMessage = 'Please allow camera and microphone access to continue.';

            if (err.name === 'NotAllowedError') {
                errorMessage = 'Camera access was denied. Please allow camera permissions and refresh the page.';
            } else if (err.name === 'NotFoundError') {
                errorMessage = 'No camera found. Please connect a camera and try again.';
            } else if (err.name === 'NotSupportedError') {
                errorMessage = 'Your browser does not support camera access. Please use Chrome, Edge, or Firefox.';
            } else if (err.name === 'NotReadableError') {
                errorMessage = 'Camera is already in use by another application. Please close other camera apps.';
            }

            this.userWarningMessage = errorMessage;
            this.notify.showError('Camera Error', errorMessage);
        }

        this.cdr.detectChanges();
    }

    private attachStreamToVideoElement(videoElement: HTMLVideoElement | undefined): void {
        if (videoElement && this.stream) {
            console.log('Attaching stream to video element');

            // Clear any existing stream
            videoElement.srcObject = null;

            // Set the new stream
            videoElement.srcObject = this.stream;
            videoElement.muted = true;
            videoElement.playsInline = true;
            videoElement.autoplay = true;

            videoElement.onloadedmetadata = () => {
                console.log('Video metadata loaded, attempting to play');
                videoElement.play().then(() => {
                    console.log('Video playback started successfully');
                }).catch((e) => {
                    console.error('Video play error:', e);
                });
            };

            videoElement.onerror = (error) => {
                console.error('Video element error:', error);
            };
        } else {
            console.warn('Cannot attach stream: video element or stream not available');
        }
    }

    private configureCameraPreview(): void {
        setTimeout(() => {
            this.attachStreamToVideoElement(this.previewVideo?.nativeElement);
        }, 100);
    }

    private handleCameraInitializationFailure(): void {
        this.isCameraEnabled = false;
        this.previewMode = false;
        this.isCameraReady = false;
    }

    private configureInterviewVideo(): void {
        if (this.interviewVideo?.nativeElement && this.stream) {
            this.attachStreamToVideoElement(this.interviewVideo.nativeElement);
        }
    }

    async startInterview(): Promise<void> {
        console.log('Starting interview...');
        this.interviewStarted = true;
        this.showRulesAndPreview = false;
        this.isInterviewInProgress = true;
        this.previewMode = false;
        this.showLanguageDropdown = false; // Hide language dropdown when interview starts
        this.interviewStartTime = Date.now();

        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
        } catch (error) {
            console.warn('Could not enter fullscreen mode:', error);
        }

        if (this.isCameraEnabled) {
            setTimeout(() => {
                this.configureInterviewVideo();
            }, 100);
        }

        this.preventResizeOnce = true;
        setTimeout(() => (this.preventResizeOnce = false), 1000);

        this.attachEventListeners();
        this.startNextQuestion();
    }

    private attachEventListeners(): void {
        if (!this.eventListenersRegistered) {
            window.addEventListener('beforeunload', this.preventUnload);
            document.addEventListener('visibilitychange', this.handleTabSwitch);
            window.addEventListener('resize', this.handleResize);
            this.eventListenersRegistered = true;
        }
    }

    addCurrentQuestionToTranscript(): void {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        if (currentQuestion?.description) {
            const questionTime = this.getRelativeTime();
            this.transcriptions.push(`AI - ${questionTime} : ${currentQuestion.description} || `);
            this.transcriptMessages.push({
                sender: 'AI',
                text: currentQuestion.description,
                align: 'left',
                type: 'question'
            });
            this.cdr.detectChanges();
            this.scrollTranscriptToBottom();
        }
    }

    private getRelativeTime(): string {
        if (!this.interviewStartTime) return '00:00:00';
        const msecondes = Date.now() - this.interviewStartTime;
        const totalSeconds = Math.floor(msecondes / 1000);

        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');

        return `${hours}:${minutes}:${seconds}`;
    }

    private async waitForSilence(maxWaitTime: number = 3000): Promise<void> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (!this.aiSpeaking && !this.tts.isCurrentlyPlaying()) {
                    clearInterval(checkInterval);
                    console.log('Silence detected, ready for speech recognition');
                    resolve();
                }

                if (Date.now() - startTime > maxWaitTime) {
                    clearInterval(checkInterval);
                    console.log('Silence wait timeout, proceeding anyway');
                    resolve();
                }
            }, 100);
        });
    }

    async startNextQuestion(): Promise<void> {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        if (!currentQuestion || !this.isInterviewInProgress) return;

        this.resetSpeechRecognitionData();
        this.timeRemaining = currentQuestion.durationInMinutes * 60;
        this.questionStartTime = Date.now();
        this.aiSpeaking = true;
        this.isReadyToSpeak = false;
        this.hideSubmissionControls();

        this.addCurrentQuestionToTranscript();
        this.initializeQuestionTimer();
        this.preloadUpcomingQuestions();

        try {
            console.log('AI starting to speak...');
            await this.tts.speak(currentQuestion.description, true);
            console.log('AI finished speaking, waiting for silence...');

            await this.waitForSilence(3000);

            await new Promise(resolve => setTimeout(resolve, 1500));

            this.aiSpeaking = false;
            this.isWaitingForAnswer = true;
            this.showSubmitButton = true;
            this.isReadyToSpeak = true;

            console.log('Ready for candidate response, starting recognition...');
            this.scheduleDelayedSpeechRecognition();

            this.cdr.detectChanges();
        } catch (error) {
            console.error('TTS error:', error);
            this.handleTTSError();
        }
    }

    private preloadUpcomingQuestions(): void {
        if (this.questions.length > 0) {
            const questionTexts = this.questions.map((q) => q.description);
            this.tts.smartPreload(questionTexts, this.currentQuestionIndex);
            const stats = this.tts.getCacheStats();
            console.log(`Cache stats: ${stats.size} items cached`);
        }
    }

    private resetSpeechRecognitionData(): void {
        this.speechRecognitionService.reset();
        this.liveSubtitle = '';
        this.currentUserAnswer = '';
        console.log('Speech recognition data reset');
    }

    private scheduleDelayedSpeechRecognition(): void {
        setTimeout(() => {
            if (this.isInterviewInProgress && this.timeRemaining > 0) {
                this.resetSpeechRecognitionData();
                this.beginSpeechRecognition();
            }
        }, 2000);
    }

    private handleTTSError(): void {
        console.warn('TTS failed, continuing with silent mode');
        this.aiSpeaking = false;
        this.isWaitingForAnswer = true;
        this.showSubmitButton = true;
        this.isReadyToSpeak = true;
        this.scheduleDelayedSpeechRecognition();
    }

    private initializeQuestionTimer(): void {
        this.questionInterval = setInterval(() => {
            this.decrementTimeRemaining();
        }, 1000);
    }

    private decrementTimeRemaining(): void {
        this.timeRemaining--;
        if (this.timeRemaining <= 0) {
            this.handleQuestionTimeExpired();
        }
    }

    private beginSpeechRecognition(): void {
        this.speechRecognitionService.start();
        console.log('🎙️ Speech recognition started for question:', this.currentQuestionIndex + 1);
    }

    submitCurrentAnswer(): void {
        const userAnswerText = this.speechRecognitionService.getFinalTranscript().trim();
        if (!userAnswerText) {
            this.notify.showWarning('No Answer', 'Please provide an answer before submitting.');
            return;
        }

        this.stopSpeechRecognition();
        this.hideSubmissionControls();
        this.isReadyToSpeak = false;

        const currentQuestion = this.questions[this.currentQuestionIndex];
        if (!currentQuestion) {
            console.error('No current question found');
            this.proceedToNextQuestion();
            return;
        }

        const actualDurationMinutes = Math.ceil((Date.now() - this.questionStartTime) / (1000 * 60));

        const answerObject: Answer = {
            id: Date.now().toString(),
            description: userAnswerText,
            durationInMinutes: actualDurationMinutes
        };

        currentQuestion.answer = answerObject;

        const formatedAnswer = `Candidate - ${this.getRelativeTime()} : ${userAnswerText}`;
        this.transcriptions[this.transcriptions.length - 1] += formatedAnswer;
        this.transcriptMessages.push({
            sender: 'You',
            text: userAnswerText,
            align: 'right',
            type: 'answer'
        });

        this.cdr.detectChanges();
        this.scrollTranscriptToBottom();

        const answerData: CreateAnswerRequest = {
            questionId: currentQuestion.id,
            description: userAnswerText,
            durationInMinutes: actualDurationMinutes
        };

        this.answerService.createAnswerForQuestion(answerData).subscribe({
            next: (response) => {
                console.log('Answer saved to backend:', response);
            },
            error: (error) => {
                console.error('Failed to save answer:', error);
            }
        });

        this.proceedToNextQuestion();
    }

    private proceedToNextQuestion(): void {
        this.stopSpeechRecognition();
        this.clearQuestionTimer();
        this.hideSubmissionControls();
        this.isReadyToSpeak = false;

        this.currentQuestionIndex++;
        if (this.currentQuestionIndex < this.questions.length) {
            setTimeout(() => this.startNextQuestion(), 1500);
        } else {
            this.finishInterview();
        }
    }

    private handleQuestionTimeExpired(): void {
        console.log('Question time limit reached');
        this.clearQuestionTimer();
        this.hideSubmissionControls();
        this.isReadyToSpeak = false;

        const userAnswerText = this.speechRecognitionService.getFinalTranscript().trim();

        if (userAnswerText) {
            this.submitCurrentAnswer();
        } else {
            this.handleNoAnswerProvided();
        }
    }

    private handleNoAnswerProvided(): void {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        if (!currentQuestion) {
            this.proceedToNextQuestion();
            return;
        }

        const actualDurationMinutes = currentQuestion.durationInMinutes;

        const emptyAnswer: Answer = {
            id: Date.now().toString(),
            description: '',
            durationInMinutes: actualDurationMinutes
        };

        currentQuestion.answer = emptyAnswer;

        const answerData: CreateAnswerRequest = {
            questionId: currentQuestion.id,
            description: '',
            durationInMinutes: actualDurationMinutes
        };

        this.answerService.createAnswerForQuestion(answerData).subscribe({
            next: (response) => {
                console.log('Empty answer saved:', response);
            },
            error: (error) => {
                console.error('Failed to save empty answer:', error);
            }
        });

        this.proceedToNextQuestion();
    }

    private clearQuestionTimer(): void {
        if (this.questionInterval) {
            clearInterval(this.questionInterval);
            this.questionInterval = null;
        }
    }

    private hideSubmissionControls(): void {
        this.showSubmitButton = false;
        this.canSubmitAnswer = false;
        this.isWaitingForAnswer = false;
    }

    stopSpeechRecognition(): void {
        this.speechRecognitionService.stop();
        this.liveSubtitle = '';
    }

    finishInterview(): void {
        this.isInterviewInProgress = false;
        this.isInterviewFinalizing = true;
        this.aiSpeaking = false;
        this.isReadyToSpeak = false;
        this.hideSubmissionControls();
        this.stopSpeechRecognition();
        this.tts.stop();
        this.clearQuestionTimer();

        this.finalizeInterviewAndSaveEvaluation();
        this.cleanupInterviewResources();
    }

    finalizeInterviewAndSaveEvaluation(): void {
        this.isInterviewFinalizing = false;
        this.isInterviewCompleted = true;

        if (!this.interviewId) {
            console.error('No interview ID available for evaluation');
            this.router.navigate(['/interview-cloture'], { replaceUrl: true });
            return;
        }

        const questionsAndAnswers: QuestionsAndAnswersForEvaluationDTO[] = this.questions.map((question) => ({
            questionDescription: question.description,
            answerDescription: question.answer?.description || '',
            estimatedAnswerTime: question.durationInMinutes,
            realAnswerTime: question.answer?.durationInMinutes || 0
        }));

        const transcriptionString = JSON.stringify(this.transcriptions);

        // ✅ Save transcription FIRST, then navigate — guarantees the transcription is persisted
        this.evaluationService.saveInterviewTranscription(this.interviewId, transcriptionString).subscribe({
            next: () => {
                console.log('✅ Interview Transcription saved, navigating...');
                this.router.navigate(['/interview-cloture'], { replaceUrl: true });
            },
            error: (err) => {
                // Even if saving fails, navigate so the candidate isn't stuck
                console.error('❌ Saving Transcription failed, navigating anyway:', err);
                this.router.navigate(['/interview-cloture'], { replaceUrl: true });
            }
        });

        // Fire-and-forget: trigger AI evaluation in background (can take a long time)
        this.evaluationService.prepareInterviewEvaluation(this.interviewId, questionsAndAnswers).subscribe({
            next: (evaluation) => console.log('Interview Evaluation completed in background:', evaluation),
            error: (err) => console.error('Background evaluation error (non-blocking):', err)
        });
    }

    private cleanupInterviewResources(): void {
        this.stopSpeechRecognition();
        this.tts.stop();
        this.tts.clearCache(false);
        this.clearQuestionTimer();
        this.releaseMediaStream();
        this.removeEventListeners();
        this.exitFullscreenMode();
        this.speechRecognitionService.destroy();
    }

    private releaseMediaStream(): void {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
    }

    private removeEventListeners(): void {
        window.removeEventListener('beforeunload', this.preventUnload);
        document.removeEventListener('visibilitychange', this.handleTabSwitch);
        window.removeEventListener('resize', this.handleResize);
        this.eventListenersRegistered = false;
    }

    private exitFullscreenMode(): void {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    }

    private preventUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
    };

    private handleTabSwitch = () => {
        if (document.visibilityState === 'hidden' && this.isInterviewInProgress) {
            this.userWarningMessage = 'Tab switch detected. You are disqualified.';
            this.notify.showError('Disqualified', 'Tab switching is not allowed during the interview.');
        }
    };

    private handleResize = () => {
        if (this.preventResizeOnce) return;
        if (this.isInterviewInProgress) {
            this.userWarningMessage = 'Window resizing is not allowed during interview.';
            this.notify.showWarning('Warning', 'Window resizing is not allowed during the interview.');
        }
    };

    closeWarning(): void {
        this.userWarningMessage = null;
    }

    private scrollTranscriptToBottom(): void {
        setTimeout(() => {
            if (this.scrollPanel && this.scrollPanel.contentViewChild?.nativeElement) {
                const el = this.scrollPanel.contentViewChild.nativeElement;
                el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                this.scrollPanel.moveBar();
            }
        }, 100);
    }

    ngOnDestroy() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
        }
        if (this.questionInterval) {
            clearInterval(this.questionInterval);
        }

        window.removeEventListener('beforeunload', this.preventUnload);
        document.removeEventListener('visibilitychange', this.handleTabSwitch);
        window.removeEventListener('resize', this.handleResize);

        this.destroy$.next();
        this.destroy$.complete();
        this.cleanupInterviewResources();
    }

    getFormattedTime(): string {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        return `Time left: ${minutes}m ${seconds}s`;
    }

    debugCacheStatus(): void {
        const stats = this.tts.getCacheStats();
        console.log('Current TTS Cache:', stats);
    }

    private monitorCameraAndAudio(): void {
        if (!this.stream) return;

        const checkInterval = setInterval(() => {
            if (!this.stream) {
                clearInterval(checkInterval);
                return;
            }

            const videoTracks = this.stream.getVideoTracks();
            const audioTracks = this.stream.getAudioTracks();

            const cameraActive = videoTracks.some(track => track.readyState === 'live');
            const micActive = audioTracks.some(track => track.readyState === 'live');

            if (this.isCameraEnabled !== cameraActive || this.isAudioEnabled !== micActive) {
                this.isCameraEnabled = cameraActive;
                this.isAudioEnabled = micActive;
                this.cdr.detectChanges();
            }

            if (!cameraActive || !micActive) {
                this.userWarningMessage = 'Camera or microphone disabled. Please enable both to continue.';
            }

        }, 1000);
    }
}
