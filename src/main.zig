const std = @import("std");

pub const Console = struct {
    pub const Logger = struct {
        pub const Error = error{};
        
    }
};

export fn main() void {
    Console.log("this is a {s}\n", .{"test"});
}
