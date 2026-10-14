import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors, FormArray, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NewCvService } from '../../../../core/services/new-cv.service';
import { LoaderService } from '../../../../core/services/loader.service';
import { PanelModule } from 'primeng/panel';
import { StepsModule } from 'primeng/steps';
import { InputTextModule } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MenuItem, ConfirmationService } from 'primeng/api';
import { Skill } from '../../../../core/models/skill';
import { Language } from '../../../../core/models/language';
import { Contact } from '../../../../core/models/contact';
import { ConfirmationModalService } from '../../../../core/services/utils/confirmation.service';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-candidate-form',
    standalone: true,
    imports: [CommonModule, PanelModule, StepsModule, InputTextModule, Textarea, ButtonModule, CheckboxModule, ReactiveFormsModule, SelectModule, RadioButtonModule, FormsModule, ConfirmDialogModule, TranslateModule],
    providers: [ConfirmationService],
    templateUrl: './stepper-form.component.html',
    styleUrls: ['./stepper-form.component.scss']
})
export class StepperFormComponent implements OnInit, OnDestroy {
    steps: MenuItem[] = [];
    activeIndex: number = 0;
    extractedData: any;

    languageLevels: any[] = [];
    skillProficiencies: any[] = [];

    generalDataForm!: FormGroup;
    addressFormWrapper!: FormGroup;
    educationFormWrapper!: FormGroup;
    experienceFormWrapper!: FormGroup;
    languagesFormWrapper!: FormGroup;
    contactsFormWrapper!: FormGroup;
    skillsFormWrapper!: FormGroup;
    newSkillName: string = '';
    newSkillProficiency: string = '';

    private langChangeSubscription!: Subscription;

    constructor(
        private fb: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private newCvService: NewCvService,
        private loaderService: LoaderService,
        private confirmationService: ConfirmationService,
        private confirmationModalService: ConfirmationModalService,
        private translate: TranslateService
    ) {}

    ngOnInit() {
        this.initializeLanguageOptions();
        this.initializeSteps();
        this.initializeForms();

        this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
            this.initializeLanguageOptions();
            this.initializeSteps();
        });

        this.route.paramMap.subscribe((params) => {
            const navigationData = history.state.extractedData;
            if (navigationData) {
                this.extractedData = navigationData;
                console.log('Extracted Data:', this.extractedData);
                this.populateForms();
            } else {
                this.addEducation();
                this.addExperience();
                this.addAddress();
            }
        });

        console.log('Current language:', this.translate.currentLang);
        console.log('General Data translation:', this.translate.instant('steppercandidate.generalData'));
    }

    ngOnDestroy() {
        if (this.langChangeSubscription) {
            this.langChangeSubscription.unsubscribe();
        }
    }

    private initializeLanguageOptions() {
        this.languageLevels = [
            { label: this.translate.instant('steppercandidate.advanced'), value: 'ADVANCED' },
            { label: this.translate.instant('steppercandidate.intermediate'), value: 'INTERMEDIATE' },
            { label: this.translate.instant('steppercandidate.basic'), value: 'BASIC' },
            { label: this.translate.instant('steppercandidate.native'), value: 'NATIVE' }
        ];

        this.skillProficiencies = [
            { label: this.translate.instant('steppercandidate.beginner'), value: 'BEGINNER' },
            { label: this.translate.instant('steppercandidate.intermediate'), value: 'INTERMEDIATE' },
            { label: this.translate.instant('steppercandidate.advanced'), value: 'ADVANCED' },
            { label: this.translate.instant('steppercandidate.expert'), value: 'EXPERT' }
        ];
    }

    private initializeSteps() {
        this.steps = [
            { label: this.translate.instant('steppercandidate.generalData') },
            { label: this.translate.instant('steppercandidate.address') },
            { label: this.translate.instant('steppercandidate.education') },
            { label: this.translate.instant('steppercandidate.experience') },
            { label: this.translate.instant('steppercandidate.languages') },
            { label: this.translate.instant('steppercandidate.skills') },
            { label: this.translate.instant('steppercandidate.contact') }
        ];
    }

    private initializeForms() {
        this.generalDataForm = this.fb.group(
            {
                fullName: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)]],
                birthDate: ['', [Validators.required, this.ageValidator]],
                yearsOfExperience: [null, [Validators.required, Validators.pattern('^[0-9]+$'), Validators.min(0)]],
                gender: ['', Validators.required],
                mainTech: ['', [Validators.required]],
                summary: ['', Validators.required]
            },
            { validators: this.experienceAgeValidator }
        );

        this.addressFormWrapper = this.fb.group({
            addressesFormArray: this.fb.array([])
        });

        this.educationFormWrapper = this.fb.group({
            educationsFormArray: this.fb.array([])
        });

        this.experienceFormWrapper = this.fb.group({
            experiencesFormArray: this.fb.array([])
        });

        this.skillsFormWrapper = this.fb.group({
            skillsFormArray: this.fb.array([])
        });

        this.languagesFormWrapper = this.fb.group({
            languagesFormArray: this.fb.array([])
        });

        this.contactsFormWrapper = this.fb.group({
            contactsFormArray: this.fb.array([])
        });
    }

    // Address FormArray methods
    get addressesFormArray(): FormArray {
        return this.addressFormWrapper.get('addressesFormArray') as FormArray;
    }

    addAddress() {
        this.addressesFormArray.push(
            this.fb.group({
                street: ['', [Validators.required]],
                postalCode: ['', [Validators.required]],
                fullAddress: ['', Validators.required],
                city: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\s'.-]+$/)]],
                country: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\s'.-]+$/)]]
            })
        );
    }

    removeAddress(index: number) {
        this.addressesFormArray.removeAt(index);
    }

    // Education FormArray methods
    get educationsFormArray(): FormArray {
        return this.educationFormWrapper.get('educationsFormArray') as FormArray;
    }

    addEducation() {
        this.educationsFormArray.push(
            this.fb.group(
                {
                    institution: ['', [Validators.required]],
                    startDate: ['', Validators.required],
                    endDate: ['', Validators.required],
                    diploma: ['', [Validators.required]]
                },
                { validators: this.dateRangeValidator }
            )
        );
    }

    removeEducation(index: number) {
        this.educationsFormArray.removeAt(index);
    }

    get experiencesFormArray(): FormArray {
        return this.experienceFormWrapper.get('experiencesFormArray') as FormArray;
    }

    addExperience() {
        this.experiencesFormArray.push(
            this.fb.group(
                {
                    companyName: ['', Validators.required],
                    position: ['', Validators.required],
                    startDate: ['', Validators.pattern('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')],
                    endDate: ['', Validators.pattern('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')],
                    description: ['']
                },
                { validators: this.experienceDateValidator }
            )
        );
    }

    removeExperience(index: number) {
        this.experiencesFormArray.removeAt(index);
    }

    get skillsFormArray(): FormArray {
        return this.skillsFormWrapper.get('skillsFormArray') as FormArray;
    }

    addSkill() {
        this.skillsFormArray.push(
            this.fb.group({
                skillName: ['', Validators.required],
                proficiencyLevel: ['', Validators.required]
            })
        );
    }

    removeSkill(index: number) {
        this.skillsFormArray.removeAt(index);
    }

    get languagesFormArray(): FormArray {
        return this.languagesFormWrapper.get('languagesFormArray') as FormArray;
    }

    addLanguage() {
        this.languagesFormArray.push(
            this.fb.group({
                language: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\s]+$/)]],
                level: ['', Validators.required],
                isNative: [false],
                description: [''],
                englishDescription: [''],
                fullDescription: [''],
                languageInEnglish: ['']
            })
        );
    }

    removeLanguage(index: number) {
        this.languagesFormArray.removeAt(index);
    }

    get contactsFormArray(): FormArray {
        return this.contactsFormWrapper.get('contactsFormArray') as FormArray;
    }

    addContact() {
        this.contactsFormArray.push(this.createContactGroup());
    }

    removeContact(index: number) {
        this.contactsFormArray.removeAt(index);
    }

    createContactGroup(type: string = 'email', value: string = ''): FormGroup {
        const group = this.fb.group({
            contactType: [type, Validators.required],
            contactValue: [value, Validators.required]
        });

        this.setContactValidators(group);
        return group;
    }

    setContactValidators(group: FormGroup): void {
        const type = group.get('contactType')?.value;
        const valueCtrl = group.get('contactValue');

        if (!valueCtrl) return;

        valueCtrl.clearValidators();

        if (type === 'email') {
            valueCtrl.setValidators([Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/)]);
        } else if (type === 'phone') {
            valueCtrl.setValidators([Validators.required, Validators.pattern(/^\s*(?:\+\s*(\d{1,3}|\(\d{1,3}\))\s*)?[\d\s\-.()]*\d[\d\s\-.()]*\s*(?:x\d+)?\s*$/)]);
        } else if (type === 'linkedin') {
            valueCtrl.setValidators([Validators.required, Validators.pattern(/^https?:\/\/(www\.)?linkedin\.com\/.*$/)]);
        } else {
            valueCtrl.setValidators([Validators.required]);
        }

        valueCtrl.updateValueAndValidity();

        group.get('contactType')?.valueChanges.subscribe(() => {
            this.setContactValidators(group);
        });
    }

    private populateForms() {
        if (!this.extractedData) return;

        this.generalDataForm.patchValue({
            fullName: this.extractedData.fullName || '',
            birthDate: this.extractedData.birthDate || '',
            yearsOfExperience: this.isNumberAndNotNull(this.extractedData.yearsOfExperience) ? parseInt(this.extractedData.yearsOfExperience).toString() : '0',
            gender: this.extractedData.gender === 'M' ? 'M' : this.extractedData.gender === 'F' ? 'F' : '',
            mainTech: this.extractedData.mainTech || '',
            summary: this.extractedData.summary || ''
        });

        if (this.extractedData.address) {
            this.addressesFormArray.clear();
            this.addressesFormArray.push(
                this.fb.group({
                    street: [this.extractedData.address.street || '', [Validators.required]],
                    postalCode: [this.extractedData.address.postalCode || '', [Validators.required]],
                    fullAddress: [this.extractedData.address.fullAddress || '', Validators.required],
                    city: [this.extractedData.address.city?.name || this.extractedData.address.city || '', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\s'.-]+$/)]],
                    country: [this.extractedData.address.country?.name || this.extractedData.address.country || '', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\s'.-]+$/)]]
                })
            );
        }

        // Populate educations
        if (this.extractedData.educations && this.extractedData.educations.length > 0) {
            this.educationsFormArray.clear();
            this.extractedData.educations.forEach((edu: any) => {
                this.educationsFormArray.push(
                    this.fb.group(
                        {
                            institution: [edu.institution || '', [Validators.required]],
                            startDate: [edu.startDate || '', Validators.required],
                            endDate: [edu.endDate || '', Validators.required],
                            diploma: [edu.diploma || edu.degree || '', [Validators.required]]
                        },
                        { validators: this.dateRangeValidator }
                    )
                );
            });
        }

        // Populate experiences
        const experiences = this.extractedData.experiences || [];
        this.experiencesFormArray.clear();
        experiences.forEach((exp: any) => {
            this.experiencesFormArray.push(
                this.fb.group(
                    {
                        companyName: [exp.companyName || '', Validators.required],
                        position: [exp.position || '', Validators.required],
                        startDate: [exp.startDate || '', Validators.pattern('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')],
                        endDate: [exp.endDate || '', Validators.pattern('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')],
                        description: [exp.description || '']
                    },
                    { validators: this.experienceDateValidator }
                )
            );
        });
        if (experiences.length === 0) {
            this.addExperience();
        }

        // Populate languages
        const languages = this.extractedData.naturalLanguages?.length ? this.extractedData.naturalLanguages : this.extractedData.languages || [];

        languages.forEach((lang: Language) => {
            this.languagesFormArray.push(
                this.fb.group({
                    language: [lang.language || '', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\s]+$/)]],
                    level: [lang.level || '', Validators.required],
                    isNative: [lang.isNative || lang.description === 'Native' || false],
                    description: [lang.description || lang.language || ''],
                    englishDescription: [lang.englishDescription || lang.language || ''],
                    fullDescription: [lang.fullDescription || ''],
                    languageInEnglish: [lang.languageInEnglish || lang.language || '']
                })
            );
        });

        // Populate skills
        if (this.extractedData.skills && this.extractedData.skills.length > 0) {
            this.extractedData.skills.forEach((skill: Skill) => {
                this.skillsFormArray.push(
                    this.fb.group({
                        skillName: [skill.skillName || '', Validators.required],
                        proficiencyLevel: [skill.proficiencyLevel || '', Validators.required]
                    })
                );
            });
        }

        // Populate contacts
        if (this.extractedData.contacts?.length) {
            this.extractedData.contacts.forEach((contact: Contact) => {
                const type = contact.contactType ?? 'email';
                const value = contact.contactValue ?? '';
                this.contactsFormArray.push(this.createContactGroup(type, value));
            });
        }
    }

    // Validators
    ageValidator(control: AbstractControl): ValidationErrors | null {
        const birthDate = control.value;
        if (birthDate) {
            const today = new Date();
            const birthDateObj = new Date(birthDate);
            let age = today.getFullYear() - birthDateObj.getFullYear();
            if (today.getMonth() < birthDateObj.getMonth() || (today.getMonth() === birthDateObj.getMonth() && today.getDate() < birthDateObj.getDate())) {
                age--;
            }
            if (age < 18) return { underAge: true };
            if (age > 80) return { overAge: true };
        }
        return null;
    }

    dateRangeValidator(control: AbstractControl): ValidationErrors | null {
        const startDate = control.get('startDate')?.value;
        const endDate = control.get('endDate')?.value;

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start > end) {
                return { invalidDateRange: true };
            }
        }
        return null;
    }

    experienceAgeValidator(control: AbstractControl): ValidationErrors | null {
        const birthDateControl = control.get('birthDate');
        const yearsControl = control.get('yearsOfExperience');

        if (birthDateControl?.value && yearsControl?.value) {
            const birthDate = new Date(birthDateControl.value);
            const yearsOfExperience = parseInt(yearsControl.value, 10);
            const today = new Date();

            let age = today.getFullYear() - birthDate.getFullYear();
            if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) {
                age--;
            }

            const maxExperience = age - 16;
            if (yearsOfExperience > maxExperience) {
                return { invalidExperience: true };
            }
        }
        return null;
    }

    experienceDateValidator(control: AbstractControl): ValidationErrors | null {
        const startDate = control.get('startDate')?.value;
        const endDate = control.get('endDate')?.value;
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const now = new Date();
            if (start > end) {
                return { invalidDateRange: true };
            }
            if (end > now) {
                return { futureEndDate: true };
            }
        }
        return null;
    }

    getCurrentForm(): FormGroup {
        switch (this.activeIndex) {
            case 0:
                return this.generalDataForm;
            case 1:
                return this.addressFormWrapper;
            case 2:
                return this.educationFormWrapper;
            case 3:
                return this.experienceFormWrapper;
            case 4:
                return this.languagesFormWrapper;
            case 5:
                return this.skillsFormWrapper;
            case 6:
                return this.contactsFormWrapper;
            default:
                return this.generalDataForm;
        }
    }

    areAllFormsValid(): boolean {
        return [this.generalDataForm, this.addressFormWrapper, this.educationFormWrapper, this.experienceFormWrapper, this.languagesFormWrapper, this.skillsFormWrapper, this.contactsFormWrapper].every((form) => form.valid);
    }

    markAllFormsTouched(): void {
        [this.generalDataForm, this.addressFormWrapper, this.educationFormWrapper, this.experienceFormWrapper, this.languagesFormWrapper, this.skillsFormWrapper, this.contactsFormWrapper].forEach((form) => form.markAllAsTouched());
    }

    next(): void {
        const currentForm = this.getCurrentForm();
        if (currentForm.valid && this.activeIndex < this.steps.length - 1) {
            this.activeIndex++;
        } else {
            currentForm.markAllAsTouched();
        }
    }

    prev(): void {
        if (this.activeIndex > 0) {
            this.activeIndex--;
        }
    }

    clearCurrentSection(): void {
        this.getCurrentForm().reset();
    }

    confirmUpdate(): void {
        this.confirmationModalService.confirmUpdate(() => {
            this.onSubmit();
        }, 'form');
    }

    onSubmit(): void {
        if (this.areAllFormsValid()) {
            const candidateData = {
                fullName: this.generalDataForm.value.fullName,
                birthDate: (this.generalDataForm.value.birthDate === 'null' || !this.generalDataForm.value.birthDate) ? null : this.generalDataForm.value.birthDate,
                yearsOfExperience: Math.floor(this.generalDataForm.value.yearsOfExperience),
                gender: this.generalDataForm.value.gender,
                mainTech: this.generalDataForm.value.mainTech,
                summary: this.generalDataForm.value.summary,
                address: this.addressesFormArray.value[0] ? {
                    street: this.addressesFormArray.value[0].street,
                    postalCode: this.addressesFormArray.value[0].postalCode,
                    fullAddress: this.addressesFormArray.value[0].fullAddress,
                    city: { name: this.addressesFormArray.value[0].city },
                    country: { name: this.addressesFormArray.value[0].country }
                } : null,
                educations: this.educationsFormArray.value,
                experiences: this.experiencesFormArray.value.filter((exp: any) => exp.companyName || exp.position || exp.startDate || exp.endDate || exp.description),
                naturalLanguages: this.languagesFormArray.value.map((lang: any) => ({
                    ...lang,
                    description: lang.description || lang.language,
                    englishDescription: lang.englishDescription || lang.language,
                    languageInEnglish: lang.languageInEnglish || lang.language
                })),
                skills: this.skillsFormArray.value,
                contacts: this.contactsFormArray.value
            };

            this.loaderService.show(this.translate.instant('steppercandidate.saving'));
            this.newCvService.saveCandidate(candidateData as any).subscribe({
                next: (res) => {
                    this.loaderService.hide();
                    alert(this.translate.instant('steppercandidate.saveSuccess') || 'Candidate saved successfully!');
                    this.router.navigate(['/candidates/list']);
                },
                error: (err) => {
                    this.loaderService.hide();
                    alert(this.translate.instant('steppercandidate.saveError') || 'Error saving candidate!');
                    console.error('Error saving candidate', err);
                }
            });
        } else {
            this.markAllFormsTouched();
        }
    }

    isNumberAndNotNull(value: string): boolean {
        return value !== null && typeof value === 'number' && Number.isFinite(value);
    }

    // Skill methods
    getProficiencyLabel(value: string): string {
        const proficiency = this.skillProficiencies.find((p) => p.value === value);
        return proficiency ? proficiency.label : '';
    }

    getProficiencyClass(proficiency: string): string {
        switch (proficiency) {
            case 'BEGINNER':
                return 'beginner';
            case 'INTERMEDIATE':
                return 'intermediate';
            case 'ADVANCED':
                return 'advanced';
            case 'EXPERT':
                return 'expert';
            default:
                return '';
        }
    }

    addNewSkill() {
        if (this.newSkillName && this.newSkillProficiency) {
            this.skillsFormArray.push(
                this.fb.group({
                    skillName: [this.newSkillName, Validators.required],
                    proficiencyLevel: [this.newSkillProficiency, Validators.required]
                })
            );
            this.newSkillName = '';
            this.newSkillProficiency = '';
        }
    }

    refreshTranslations() {
        this.initializeLanguageOptions();
        this.initializeSteps();
    }
}
