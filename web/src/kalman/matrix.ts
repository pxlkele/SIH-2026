/**
 * Fixed-size linear algebra just for our filter. State is 4-dimensional
 * ([E, N, vE, vN]) and measurements are 2-dimensional, so we hardcode the
 * shapes and avoid pulling in a big matrix library.
 */

export type Vec4 = [number, number, number, number];
export type Vec2 = [number, number];
export type Mat44 = [Vec4, Vec4, Vec4, Vec4];
export type Mat42 = [Vec2, Vec2, Vec2, Vec2];
export type Mat24 = [Vec4, Vec4];
export type Mat22 = [Vec2, Vec2];

export const eye4: Mat44 = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

export function diag4(a: number, b: number, c: number, d: number): Mat44 {
  return [
    [a, 0, 0, 0],
    [0, b, 0, 0],
    [0, 0, c, 0],
    [0, 0, 0, d],
  ];
}

export function mat44MulVec4(A: Mat44, x: Vec4): Vec4 {
  return [
    A[0][0] * x[0] + A[0][1] * x[1] + A[0][2] * x[2] + A[0][3] * x[3],
    A[1][0] * x[0] + A[1][1] * x[1] + A[1][2] * x[2] + A[1][3] * x[3],
    A[2][0] * x[0] + A[2][1] * x[1] + A[2][2] * x[2] + A[2][3] * x[3],
    A[3][0] * x[0] + A[3][1] * x[1] + A[3][2] * x[2] + A[3][3] * x[3],
  ];
}

export function mat42MulVec2(A: Mat42, u: Vec2): Vec4 {
  return [
    A[0][0] * u[0] + A[0][1] * u[1],
    A[1][0] * u[0] + A[1][1] * u[1],
    A[2][0] * u[0] + A[2][1] * u[1],
    A[3][0] * u[0] + A[3][1] * u[1],
  ];
}

export function mat44MulMat44(A: Mat44, B: Mat44): Mat44 {
  const out: Mat44 = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[i][k] * B[k][j];
      out[i][j] = s;
    }
  }
  return out;
}

export function mat44Transpose(A: Mat44): Mat44 {
  return [
    [A[0][0], A[1][0], A[2][0], A[3][0]],
    [A[0][1], A[1][1], A[2][1], A[3][1]],
    [A[0][2], A[1][2], A[2][2], A[3][2]],
    [A[0][3], A[1][3], A[2][3], A[3][3]],
  ];
}

export function mat44Add(A: Mat44, B: Mat44): Mat44 {
  const out: Mat44 = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) out[i][j] = A[i][j] + B[i][j];
  return out;
}

export function mat44Sub(A: Mat44, B: Mat44): Mat44 {
  const out: Mat44 = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) out[i][j] = A[i][j] - B[i][j];
  return out;
}

/** 2x2 matrix inverse. Small, closed-form. */
export function mat22Inv(A: Mat22): Mat22 {
  const [a, b] = A[0];
  const [c, d] = A[1];
  const det = a * d - b * c;
  const inv = 1 / det;
  return [
    [d * inv, -b * inv],
    [-c * inv, a * inv],
  ];
}
