import { applyDecorators } from '@nestjs/common';
import { Matches, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
// At least one letter and one digit — deliberately not requiring symbols/case
// mixes on top of that; this is a floor against trivial passwords ("12345678"),
// not a UX-hostile complexity checklist.
export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;
export const PASSWORD_COMPLEXITY_MESSAGE =
  'Password must be at least 8 characters and include at least one letter and one number';

export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_COMPLEXITY_MESSAGE }),
    Matches(PASSWORD_COMPLEXITY_REGEX, {
      message: PASSWORD_COMPLEXITY_MESSAGE,
    }),
  ) as PropertyDecorator;
}
