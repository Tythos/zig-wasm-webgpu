/**
 * public/basic.f.wgsl
 */

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let c = input.cell / grid;
    return vec4f(c, 1.0 - c.x, 1.0);
}
