import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class ParentLoginDto {
  /** Registered mobile number of the father or mother. */
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @MaxLength(20)
  @Matches(/^[0-9+\-\s()]{7,20}$/, { message: 'Enter a valid phone number' })
  phone!: string;

  /** Any of the family's admission numbers, e.g. BB-U1-2627-0001. */
  @IsString()
  @IsNotEmpty({ message: 'Admission number is required' })
  @MaxLength(32)
  admissionNo!: string;
}
