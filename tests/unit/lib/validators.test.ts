import { validateResourceType, validateRequired } from '../../../src/lib/validation/validators';

const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit ${code}`); });
const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => { mockExit.mockRestore(); mockError.mockRestore(); });
beforeEach(() => { mockExit.mockClear(); mockError.mockClear(); });

describe('validateResourceType', () => {
  it('passes for valid types, fails for invalid', () => {
    expect(() => validateResourceType('agent', ['agent', 'block'])).not.toThrow();
    expect(() => validateResourceType('invalid', ['agent'])).toThrow('exit 1');
  });
});

describe('validateRequired', () => {
  it('passes for truthy, fails for falsy', () => {
    expect(() => validateRequired('value', 'param')).not.toThrow();
    expect(() => validateRequired(null, 'param')).toThrow('exit 1');
    expect(() => validateRequired('', 'param')).toThrow('exit 1');
  });

  it('shows usage when provided', () => {
    expect(() => validateRequired(null, 'name', 'usage hint')).toThrow();
    expect(mockError).toHaveBeenCalledWith('Usage: usage hint');
  });
});
