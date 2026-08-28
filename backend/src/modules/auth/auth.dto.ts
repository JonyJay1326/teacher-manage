import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/** 登录 DTO */
export class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

/** 修改密码 DTO */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  oldPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string;
}

/** 设置/修改 PIN DTO（需验登录密码） */
export class SetPinDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN 须为 6 位数字' })
  pin!: string;
}

/** 校验 PIN 解锁 DTO */
export class VerifyPinDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN 须为 6 位数字' })
  pin!: string;
}
