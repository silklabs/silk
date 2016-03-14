/**
 * @flow
 */

export type Size = {
  width: number;
  height: number;
};

export type Rect = Size & {
  x: number;
  y: number;
};

export type DrawObjectArgs = {
  context: CanvasRenderingContext2D;
  container: Size;
  rect: Rect;
  color: string;
  label: string;
  labelColor: string;
  labelHeight: number;
  labelPadding?: number;
  labelPaddingX?: number;
  labelPaddingY?: number;
};

export type ColorPair = {
  background: string;
  label: string;
};

export const colors: {[colorName: string]: string} = {
  paleBlue: '#EFF3F3',
  blueGray: '#DCE6E6',
  gray: '#A0A0A0',
  darkGray: '#424242',
  darkBlue: '#267686',
  green: '#3CC0A5',
  red: '#ED734C',
  orange: '#F2A45B',
  paleWarmGray: '#EEE9DF',
  transparentGray: 'rgba(160,160,160,0.75)',
  transparentDarkGray: 'rgba(66,66,66,0.75)',
};

const objectColors: Array<string> = [
  colors.blueGray,
  colors.darkBlue,
  colors.green,
  colors.red,
  colors.orange,
];

function asciiSum(string: string) {
  let sum = 0;
  for (let index = 0; index < string.length; index++) {
    sum += string.charCodeAt(index);
  }
  return sum;
}

export function colorsForLabel(label: string): ColorPair {
  const colorIndex = asciiSum(label) % objectColors.length;
  return {
    background: objectColors[colorIndex],
    label: colorIndex === 0 ? 'black' : 'white',
  };
}

export function drawObject(args: DrawObjectArgs): void {
  args.context.strokeStyle = args.color;
  args.context.strokeRect(args.rect.x,
                          args.rect.y,
                          args.rect.width,
                          args.rect.height);

  const xPadding = args.labelPadding || args.labelPaddingX || 0;
  const yPadding = args.labelPadding || args.labelPaddingY || 0;

  const width =
    Math.round(args.context.measureText(args.label).width) + 2 * xPadding;
  const height =
    args.labelHeight + 2 * yPadding;
  const x =
    (args.rect.x + width <= args.container.width) ?
    args.rect.x :
    args.container.width - width;
  const y =
    (args.rect.y + args.rect.height + height <= args.container.height) ?
    args.rect.y + args.rect.height :
    args.rect.y - height;

  args.context.fillStyle = args.color;
  args.context.fillRect(x, y, width, height);

  // A simple strokeRect() for the tag looks bad when we have less
  // than total opacity because it redraws one segment that was
  // already drawn by the strokeRect() call above and it becomes more
  // opaque than the other segments... Use a path instead.
  args.context.beginPath();
  if (y < args.rect.y) {
    args.context.moveTo(x, y + height);
    args.context.lineTo(x, y);
    args.context.lineTo(x + width, y);
    args.context.lineTo(x + width, y + height);
  } else {
    args.context.moveTo(x, y);
    args.context.lineTo(x, y + height);
    args.context.lineTo(x + width, y + height);
    args.context.lineTo(x + width, y);
  }
  args.context.stroke();

  args.context.fillStyle = args.labelColor;
  args.context.fillText(args.label, x + xPadding, y + yPadding);
}
