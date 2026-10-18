import io.github.classgraph.ClassGraph;
import io.github.classgraph.ClassInfo;
import io.github.classgraph.ScanResult;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;

/** Writes each class (source file, declared methods, supertypes) and its dependencies as TSV. */
public class Dump {
    public static void main(String[] args) throws IOException {
        try (ScanResult scan = new ClassGraph()
                .overrideClasspath(args[0])
                .ignoreClassVisibility()
                .ignoreMethodVisibility()
                .enableMethodInfo()
                .enableInterClassDependencies()
                .scan();
             PrintWriter out = new PrintWriter(Files.newBufferedWriter(Path.of(args[1])))) {
            for (ClassInfo c : scan.getAllClasses()) {
                out.println(String.join("\t", "class", c.getName(), c.getPackageName(),
                        String.valueOf(c.getSourceFile()),
                        String.join(",", c.getDeclaredMethodInfo().getNames())));
                for (ClassInfo s : c.getSuperclasses()) out.println("super\t" + c.getName() + "\t" + s.getName());
                for (ClassInfo i : c.getInterfaces()) out.println("super\t" + c.getName() + "\t" + i.getName());
                for (ClassInfo d : c.getClassDependencies()) out.println("dep\t" + c.getName() + "\t" + d.getName());
            }
        }
    }
}
