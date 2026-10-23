import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const USER_ROLES = [
  'FOUNDER',
  'ACADEMIC_DIR',
  'CURRICULUM_LEAD',
  'CENTRE_HEAD',
  'COORDINATOR',
  'TEACHER',
  'RECEPTIONIST',
  'HR_MANAGER',
] as const;

export class CreateUserDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(190)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsIn(USER_ROLES, { message: 'Unknown role' })
  role!: (typeof USER_ROLES)[number];

  /** Required for unit-level roles, ignored for Head Office roles. */
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128)
  newPassword!: string;
}
