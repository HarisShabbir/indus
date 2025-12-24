import React, { useEffect, useState } from "react";

interface SvgIconProps {
  name: string;
  className?: string;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  fill?: string;
  stroke?: string;
  strokeWidth?: number | string;
  viewBox?: string;
}

const SvgIcon: React.FC<SvgIconProps> = ({
  name,
  className,
  width,
  height,
  style,
  fill,
  stroke,
  strokeWidth,
  viewBox,
}) => {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadSvg = async () => {
      try {
        const response = await fetch(`/svg/${name}.svg`);
        if (!response.ok) {
          throw new Error(`Failed to load SVG: ${name}`);
        }
        const text = await response.text();
        setSvgContent(text);
        setError(false);
      } catch (err) {
        console.error(`Error loading SVG ${name}:`, err);
        setError(true);
      }
    };

    loadSvg();
  }, [name]);

  if (error) {
    return (
      <span className={className} style={style}>
        [SVG: {name}]
      </span>
    );
  }

  if (!svgContent) {
    return null; // or a loading spinner
  }

  // Parse and modify SVG content
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgElement = svgDoc.querySelector("svg");

  if (!svgElement) {
    return null;
  }

  // Apply props
  if (className) {
    svgElement.setAttribute("class", className);
  }
  if (width) {
    svgElement.setAttribute("width", String(width));
  }
  if (height) {
    svgElement.setAttribute("height", String(height));
  }
  if (viewBox) {
    svgElement.setAttribute("viewBox", viewBox);
  }
  if (fill) {
    svgElement.setAttribute("fill", fill);
  }
  if (stroke) {
    svgElement.setAttribute("stroke", stroke);
  }
  if (strokeWidth) {
    svgElement.setAttribute("stroke-width", String(strokeWidth));
  }

  // Apply inline styles
  if (style) {
    Object.entries(style).forEach(([key, value]) => {
      svgElement.style.setProperty(
        key.replace(/([A-Z])/g, "-$1").toLowerCase(),
        String(value)
      );
    });
  }

  return (
    <span
      dangerouslySetInnerHTML={{ __html: svgElement.outerHTML }}
      style={style}
    />
  );
};

export default SvgIcon;

